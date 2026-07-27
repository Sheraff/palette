import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { apcaContrast, contrastRatio, okDistance, rgbToHex, rgbToOKLab, roleMinimumDistance } from "./color.ts"
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
import type { PaletteRelationNode } from "./palette-relation-graph.ts"
import type { GradientEvidence, Palette, PaletteMetrics, RawImage, RGB, RoleColor, RoleName } from "./types.ts"

export const NEXT_PALETTE_JOINT_PARETO_ALGORITHM_VERSION = "region-graph-next-joint-pareto-0.5.0-development"

export const NEXT_PALETTE_JOINT_PARETO_POLICY = Object.freeze({
	version: "next-palette-joint-pareto-policy-0.5.0-development",
	incumbentAlgorithmVersion: ALGORITHM_VERSION,
	evidenceVersion: JOINT_PALETTE_EVIDENCE_VERSION,
	maximumDistinctRoleColors: 4,
	challengerGeneratedColorsAllowed: false,
	introducedForegroundAccentCollapseAllowed: false,
	fixedApcaAdmissionFloor: null,
	comparisonEpsilon: 1e-12,
	selection: "complete-tuple-pareto-dominance-over-canonical-then-minimum-semantic-blocks-then-candidate-pareto-then-atoms-then-stable-key",
})

export type NextPaletteJointObjectiveVector = readonly [
	backgroundFieldSupport: number,
	fieldStateSupport: number,
	foregroundRoleSupport: number,
	foregroundWorstFieldApcaMagnitude: number,
	accentIdentitySupport: number,
	accentBackgroundApcaMagnitude: number,
]

export type NextPaletteJointAblationName =
	| "canonical-background"
	| "canonical-surface"
	| "canonical-field-state"
	| "canonical-field-block"
	| "canonical-foreground"
	| "canonical-accent"
	| "canonical-overlay-block"
	| "without-connected-family-local"

type RoleProvenance = {
	stableKey: string
	rgb: RGB
	representativePixelIndex: number
	supportMaskSha256: string
	kind: "field-candidate" | JointPaletteOverlayAlternative["provenance"]["kind"]
}

export type NextPaletteJointSelectionSummary = {
	changed: boolean
	admitted: boolean
	stableKey: string
	fieldState: JointPaletteFieldState
	changedSemanticBlocks: number
	changedSemanticAtoms: number
	objectives: NextPaletteJointObjectiveVector
	objectiveDeltas: NextPaletteJointObjectiveVector
}

export type NextPaletteJointFrontierEntry = NextPaletteJointSelectionSummary & {
	changedBlocks: { field: boolean; foreground: boolean; accent: boolean }
	roles: Record<RoleName, RGB>
}

export type NextPaletteJointParetoCertificate = {
	schemaVersion: 1
	algorithmVersion: typeof NEXT_PALETTE_JOINT_PARETO_ALGORITHM_VERSION
	incumbentAlgorithmVersion: typeof ALGORITHM_VERSION
	policy: typeof NEXT_PALETTE_JOINT_PARETO_POLICY
	incumbent: {
		evidenceAvailable: boolean
		unavailableReasons: readonly string[]
		fieldState: JointPaletteFieldState
		objectives: NextPaletteJointObjectiveVector
		stableKey: string
	}
	counts: {
		fieldNodes: number
		fieldTreatments: number
		canonicalSeededFieldTreatments: number
		overlayAlternatives: number
		logicalCompleteTuples: number
		fieldTreatmentsMeetingIncumbent: number
		foregroundPairCandidates: number
		accentConditionalFrontierMembers: number
		attemptedCompleteTuples: number
		admittedCompleteTuples: number
		paretoCompleteTuples: number
		minimumChangeCompleteTuples: number
		pruningWitnesses: number
	}
	pruning: {
		witnessSha256: string
		incumbentThresholdPruningIsLossless: true
		roleParetoPruningIsLossless: true
	}
	selected: NextPaletteJointSelectionSummary & {
		roles: Record<RoleName, RoleProvenance | { stableKey: "canonical-generated"; rgb: RGB; kind: "canonical-generated" }>
		apcaLc: {
			foregroundOnBackground: number
			foregroundOnSurface: number
			accentOnBackground: number
			accentOnSurface: number
		}
		fieldTreatment: JointPaletteFieldTreatment | null
	}
	minimumBlockFrontier: readonly NextPaletteJointFrontierEntry[]
	completeTupleFrontier: readonly NextPaletteJointFrontierEntry[]
	ablations: Record<NextPaletteJointAblationName, NextPaletteJointSelectionSummary>
	invariants: {
		canonicalIncumbentAlwaysAvailable: true
		sourceExactChallengersOnly: true
		maximumFourColors: true
		explicitFieldState: true
		explicitAccentCollapse: true
		foregroundFieldCollapseAbsent: true
		accentFieldCollapseAbsent: true
		finiteSignedApca: true
		fixedApcaFloorAbsent: true
		completeTupleParetoComparison: true
		incumbentPreservingChangePriority: true
		fieldTreatmentIsOneSemanticBlock: true
		noPostselectionMutation: true
		unchangedIsExactCanonical: true
	}
}

export type NextPaletteJointParetoResult = { palette: Palette; certificate: NextPaletteJointParetoCertificate }
export type NextPaletteJointParetoContext = NextPaletteJointParetoResult & {
	canonicalExtraction: ReturnType<typeof extractPaletteWithContext>["extraction"]
	evidence: JointPaletteEvidence
}

type Selection = {
	background: PaletteRelationNode
	foreground: JointPaletteOverlayAlternative
	surface: PaletteRelationNode
	accent: JointPaletteOverlayAlternative
	fieldTreatment: JointPaletteFieldTreatment
	fieldState: JointPaletteFieldState
	objectives: NextPaletteJointObjectiveVector
	stableKey: string
	semanticKey: string
	changedSemanticBlocks: number
	changedSemanticAtoms: number
	apcaLc: NextPaletteJointParetoCertificate["selected"]["apcaLc"]
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

type PruningWitness = {
	role: "field" | "foreground" | "accent"
	pair: string
	dominated: string
	dominator: string
	dominatedValues: readonly number[]
	dominatorValues: readonly number[]
}

const epsilon = NEXT_PALETTE_JOINT_PARETO_POLICY.comparisonEpsilon
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

function equalVector(first: readonly number[], second: readonly number[]): boolean {
	return first.every((value, index) => Math.abs(value - second[index]) <= epsilon)
}

function objectiveDeltas(
	objectives: NextPaletteJointObjectiveVector,
	incumbent: NextPaletteJointObjectiveVector,
): NextPaletteJointObjectiveVector {
	return objectives.map((value, index) => value - incumbent[index]) as unknown as NextPaletteJointObjectiveVector
}

function fieldState(palette: Palette): JointPaletteFieldState {
	return sameRgb(palette.background.rgb, palette.surface.rgb)
		? "collapsed"
		: palette.gradient.isGradient ? "gradient" : "distinct-flat"
}

function semanticKey(
	background: RGB,
	foreground: RGB,
	surface: RGB,
	accent: RGB,
	state: JointPaletteFieldState,
): string {
	return [rgbKey(background), rgbKey(foreground), rgbKey(surface), rgbKey(accent), state].join("|")
}

function semanticChanges(selection: Pick<Selection, "background" | "foreground" | "surface" | "accent" | "fieldState">,
	canonical: Palette): number {
	return Number(!sameRgb(selection.background.rgb, canonical.background.rgb) || canonical.background.generated) +
		Number(!sameRgb(selection.foreground.rgb, canonical.foreground.rgb) || canonical.foreground.generated) +
		Number(!sameRgb(selection.surface.rgb, canonical.surface.rgb) || canonical.surface.generated) +
		Number(!sameRgb(selection.accent.rgb, canonical.accent.rgb) || canonical.accent.generated) +
		Number(selection.fieldState !== fieldState(canonical))
}

function semanticBlocks(selection: Pick<Selection, "background" | "foreground" | "surface" | "accent" | "fieldState">,
	canonical: Palette): number {
	const fieldChanged = !sameRgb(selection.background.rgb, canonical.background.rgb) || canonical.background.generated ||
		!sameRgb(selection.surface.rgb, canonical.surface.rgb) || canonical.surface.generated ||
		selection.fieldState !== fieldState(canonical)
	return Number(fieldChanged) +
		Number(!sameRgb(selection.foreground.rgb, canonical.foreground.rgb) || canonical.foreground.generated) +
		Number(!sameRgb(selection.accent.rgb, canonical.accent.rgb) || canonical.accent.generated)
}

function changedBlocks(selection: Pick<Selection, "background" | "foreground" | "surface" | "accent" | "fieldState">,
	canonical: Palette): NextPaletteJointFrontierEntry["changedBlocks"] {
	return {
		field: !sameRgb(selection.background.rgb, canonical.background.rgb) || canonical.background.generated ||
			!sameRgb(selection.surface.rgb, canonical.surface.rgb) || canonical.surface.generated ||
			selection.fieldState !== fieldState(canonical),
		foreground: !sameRgb(selection.foreground.rgb, canonical.foreground.rgb) || canonical.foreground.generated,
		accent: !sameRgb(selection.accent.rgb, canonical.accent.rgb) || canonical.accent.generated,
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

function paretoPrune<T>(
	values: readonly T[],
	stableKeyOf: (value: T) => string,
	vectorOf: (value: T) => readonly number[],
	role: PruningWitness["role"],
	pair: string,
	witnesses: PruningWitness[],
): T[] {
	const ordered = [...values].sort((first, second) => compareAscii(stableKeyOf(first), stableKeyOf(second)))
	const frontier: T[] = []
	for (const candidate of ordered) {
		const candidateVector = vectorOf(candidate)
		const dominator = frontier.find((existing) => dominates(vectorOf(existing), candidateVector) ||
			(equalVector(vectorOf(existing), candidateVector) && compareAscii(stableKeyOf(existing), stableKeyOf(candidate)) < 0))
		if (dominator) {
			witnesses.push({
				role,
				pair,
				dominated: stableKeyOf(candidate),
				dominator: stableKeyOf(dominator),
				dominatedValues: candidateVector,
				dominatorValues: vectorOf(dominator),
			})
			continue
		}
		for (let index = frontier.length - 1; index >= 0; index--) {
			const existing = frontier[index]
			if (!dominates(candidateVector, vectorOf(existing))) continue
			witnesses.push({
				role,
				pair,
				dominated: stableKeyOf(existing),
				dominator: stableKeyOf(candidate),
				dominatedValues: vectorOf(existing),
				dominatorValues: candidateVector,
			})
			frontier.splice(index, 1)
		}
		frontier.push(candidate)
	}
	return frontier.sort((first, second) => compareAscii(stableKeyOf(first), stableKeyOf(second)))
}

function canonicalEvidence(canonical: Palette, evidence: JointPaletteEvidence): {
	available: boolean
	reasons: string[]
	state: JointPaletteFieldState
	objectives: NextPaletteJointObjectiveVector
	stableKey: string
} {
	const state = fieldState(canonical)
	const fieldNodes = evidence.graph.nodes.filter((node) => !node.typographyOnly)
	const backgroundAliases = canonical.background.generated ? [] : fieldNodes.filter((node) => sameRgb(node.rgb, canonical.background.rgb))
	const surfaceAliases = canonical.surface.generated ? [] : fieldNodes.filter((node) => sameRgb(node.rgb, canonical.surface.rgb))
	const foregroundAliases = canonical.foreground.generated ? [] : evidence.overlays.filter((overlay) =>
		sameRgb(overlay.rgb, canonical.foreground.rgb))
	const accentAliases = canonical.accent.generated ? [] : evidence.overlays.filter((overlay) =>
		sameRgb(overlay.rgb, canonical.accent.rgb))
	const reasons: string[] = []
	if (canonical.background.generated || backgroundAliases.length === 0) reasons.push("canonical-background-evidence-unavailable")
	if (canonical.surface.generated || surfaceAliases.length === 0) reasons.push("canonical-surface-evidence-unavailable")
	if (!canonical.foreground.generated && foregroundAliases.length === 0) reasons.push("canonical-foreground-evidence-unavailable")
	if (!canonical.accent.generated && accentAliases.length === 0) reasons.push("canonical-accent-evidence-unavailable")
	const backgroundSupport = backgroundAliases.length === 0 ? 0 : Math.max(...backgroundAliases.map((node) =>
		node.fieldEligibility.support))
	const fieldSupport = backgroundAliases.length === 0 || surfaceAliases.length === 0 ? 0 : Math.max(
		...backgroundAliases.flatMap((background) => surfaceAliases.map((surface) =>
			jointPaletteFieldStateEvidence(evidence.graph, evidence.perception.analysis, background, surface, state).support)),
	)
	const foregroundSupport = canonical.foreground.generated ? 0 : foregroundAliases.length === 0 ? 0 :
		Math.max(...foregroundAliases.map((overlay) => overlay.evidence.foregroundSupport))
	const accentSupport = canonical.accent.generated ? 0 : accentAliases.length === 0 ? 0 :
		Math.max(...accentAliases.map((overlay) => overlay.evidence.accentIdentitySupport))
	const foregroundBackgroundLc = apcaContrast(canonical.foreground.rgb, canonical.background.rgb)
	const foregroundSurfaceLc = apcaContrast(canonical.foreground.rgb, canonical.surface.rgb)
	const accentBackgroundLc = apcaContrast(canonical.accent.rgb, canonical.background.rgb)
	const objectives: NextPaletteJointObjectiveVector = [
		backgroundSupport,
		fieldSupport,
		foregroundSupport,
		Math.min(Math.abs(foregroundBackgroundLc), Math.abs(foregroundSurfaceLc)),
		accentSupport,
		Math.abs(accentBackgroundLc),
	]
	if (objectives.some((value) => !Number.isFinite(value))) reasons.push("canonical-objective-non-finite")
	return {
		available: reasons.length === 0,
		reasons,
		state,
		objectives,
		stableKey: semanticKey(canonical.background.rgb, canonical.foreground.rgb, canonical.surface.rgb,
			canonical.accent.rgb, state),
	}
}

function fieldTreatmentsWithCanonicalSeed(canonical: Palette, evidence: JointPaletteEvidence): JointPaletteFieldTreatment[] {
	const incumbentState = fieldState(canonical)
	const fieldNodes = evidence.graph.nodes.filter((node) => !node.typographyOnly)
	const backgrounds = canonical.background.generated ? [] : fieldNodes.filter((node) => sameRgb(node.rgb, canonical.background.rgb))
	const surfaces = canonical.surface.generated ? [] : fieldNodes.filter((node) => sameRgb(node.rgb, canonical.surface.rgb))
	const seeded = backgrounds.flatMap((background) => surfaces.map((surface): JointPaletteFieldTreatment => {
		const stateEvidence = jointPaletteFieldStateEvidence(
			evidence.graph,
			evidence.perception.analysis,
			background,
			surface,
			incumbentState,
		)
		return {
			stableKey: `canonical-seed:${background.stableKey}|${surface.stableKey}|${incumbentState}`,
			backgroundNodeId: background.id,
			surfaceNodeId: surface.id,
			state: incumbentState,
			stateSupport: stateEvidence.support,
			endpointDistance: stateEvidence.endpointDistance,
			fieldRelation: stateEvidence.relation,
		}
	}))
	const byIdentity = new Map<string, JointPaletteFieldTreatment>()
	for (const treatment of evidence.fieldTreatments) {
		const key = `${treatment.backgroundNodeId}>${treatment.surfaceNodeId}:${treatment.state}`
		const incumbent = byIdentity.get(key)
		if (!incumbent || compareAscii(treatment.stableKey, incumbent.stableKey) < 0) byIdentity.set(key, treatment)
	}
	for (const treatment of seeded) {
		const key = `${treatment.backgroundNodeId}>${treatment.surfaceNodeId}:${treatment.state}`
		byIdentity.set(key, treatment)
	}
	return [...byIdentity.values()].sort((first, second) => compareAscii(first.stableKey, second.stableKey))
}

function selectionSummary(
	selection: Selection | null,
	canonical: Palette,
	incumbent: ReturnType<typeof canonicalEvidence>,
): NextPaletteJointSelectionSummary {
	if (!selection) {
		return {
			changed: false,
			admitted: false,
			stableKey: incumbent.stableKey,
			fieldState: incumbent.state,
			changedSemanticBlocks: 0,
			changedSemanticAtoms: 0,
			objectives: incumbent.objectives,
			objectiveDeltas: [0, 0, 0, 0, 0, 0],
		}
	}
	return {
		changed: semanticChanges(selection, canonical) > 0,
		admitted: true,
		stableKey: selection.stableKey,
		fieldState: selection.fieldState,
		changedSemanticBlocks: selection.changedSemanticBlocks,
		changedSemanticAtoms: selection.changedSemanticAtoms,
		objectives: selection.objectives,
		objectiveDeltas: objectiveDeltas(selection.objectives, incumbent.objectives),
	}
}

function select(
	canonical: Palette,
	evidence: JointPaletteEvidence,
	incumbent: ReturnType<typeof canonicalEvidence>,
	constraints: Constraints = {},
): { selection: Selection | null; witnesses: PruningWitness[]; counts: Omit<NextPaletteJointParetoCertificate["counts"],
	"fieldNodes" | "fieldTreatments" | "overlayAlternatives" | "logicalCompleteTuples">; preferred: Selection[];
	completeFrontier: Selection[] } {
	const witnesses: PruningWitness[] = []
	if (!incumbent.available) {
		return { selection: null, witnesses, preferred: [], completeFrontier: [], counts: {
			fieldTreatmentsMeetingIncumbent: 0,
			foregroundPairCandidates: 0,
			accentConditionalFrontierMembers: 0,
			attemptedCompleteTuples: 0,
			admittedCompleteTuples: 0,
			paretoCompleteTuples: 0,
			minimumChangeCompleteTuples: 0,
			pruningWitnesses: 0,
		} }
	}
	const nodeById = new Map(evidence.graph.nodes.map((node) => [node.id, node]))
	const fieldCandidates = fieldTreatmentsWithCanonicalSeed(canonical, evidence).filter((treatment) => {
		const background = nodeById.get(treatment.backgroundNodeId)!
		const surface = nodeById.get(treatment.surfaceNodeId)!
		const canonicalSeed = treatment.stableKey.startsWith("canonical-seed:")
		const backgroundSupport = canonicalSeed ? incumbent.objectives[0] : background.fieldEligibility.support
		const stateSupport = canonicalSeed ? incumbent.objectives[1] : treatment.stateSupport
		if ((constraints.canonicalBackground || constraints.canonicalFieldBlock) &&
			!sameRgb(background.rgb, canonical.background.rgb)) return false
		if ((constraints.canonicalSurface || constraints.canonicalFieldBlock) &&
			!sameRgb(surface.rgb, canonical.surface.rgb)) return false
		if ((constraints.canonicalFieldState || constraints.canonicalFieldBlock) && treatment.state !== incumbent.state) return false
		const fieldChanged = !sameRgb(background.rgb, canonical.background.rgb) ||
			!sameRgb(surface.rgb, canonical.surface.rgb) || treatment.state !== incumbent.state
		return backgroundSupport + epsilon >= incumbent.objectives[0] &&
			stateSupport + epsilon >= incumbent.objectives[1] && (!fieldChanged || stateSupport > epsilon)
	})
	const overlays = evidence.overlays.filter((overlay) =>
		!constraints.withoutConnectedFamilyLocal || overlay.provenance.kind !== "connected-family-local")
	let foregroundPairCandidates = 0
	let accentConditionalFrontierMembers = 0
	let attemptedCompleteTuples = 0
	let admittedCompleteTuples = 0
	const admittedSelections: Selection[] = []
	let completeFrontier: Selection[] = []
	for (const treatment of fieldCandidates) {
		const background = nodeById.get(treatment.backgroundNodeId)!
		const surface = nodeById.get(treatment.surfaceNodeId)!
		const pair = `${rgbKey(background.rgb)}>${rgbKey(surface.rgb)}`
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
		const accentEvaluated = overlays.flatMap((overlay) => {
			if (sameRgb(overlay.rgb, background.rgb) || sameRgb(overlay.rgb, surface.rgb)) return []
			if ((constraints.canonicalAccent || constraints.canonicalOverlayBlock) &&
				!sameRgb(overlay.rgb, canonical.accent.rgb)) return []
			const contrast = evaluateJointPaletteOverlayContrast(overlay, background.rgb, surface.rgb)
			if (overlay.evidence.accentIdentitySupport + epsilon < incumbent.objectives[4] ||
				contrast.background.magnitude + epsilon < incumbent.objectives[5]) return []
			return [{ overlay, contrast }]
		})
		foregroundPairCandidates += foregroundEvaluated.length
		for (const foreground of foregroundEvaluated) {
			const accents = paretoPrune(
				accentEvaluated.filter((accent) =>
					NEXT_PALETTE_JOINT_PARETO_POLICY.introducedForegroundAccentCollapseAllowed ||
					!sameRgb(foreground.overlay.rgb, accent.overlay.rgb) ||
					sameRgb(canonical.foreground.rgb, canonical.accent.rgb)),
				(value) => value.overlay.stableKey,
				(value) => [value.overlay.evidence.accentIdentitySupport, value.contrast.background.magnitude],
				"accent",
				`${pair}|foreground:${rgbKey(foreground.overlay.rgb)}`,
				witnesses,
			)
			accentConditionalFrontierMembers += accents.length
			for (const accent of accents) {
				attemptedCompleteTuples++
				if (new Set([background.rgb, foreground.overlay.rgb, surface.rgb, accent.overlay.rgb].map(rgbKey)).size >
					NEXT_PALETTE_JOINT_PARETO_POLICY.maximumDistinctRoleColors) continue
				const canonicalSeed = treatment.stableKey.startsWith("canonical-seed:")
				const objectives: NextPaletteJointObjectiveVector = [
					canonicalSeed ? incumbent.objectives[0] : background.fieldEligibility.support,
					canonicalSeed ? incumbent.objectives[1] : treatment.stateSupport,
					foreground.overlay.evidence.foregroundSupport,
					foreground.worst,
					accent.overlay.evidence.accentIdentitySupport,
					accent.contrast.background.magnitude,
				]
				if (!dominates(objectives, incumbent.objectives)) continue
				const selection: Selection = {
					background,
					foreground: foreground.overlay,
					surface,
					accent: accent.overlay,
					fieldTreatment: treatment,
					fieldState: treatment.state,
					objectives,
					stableKey: [treatment.stableKey, foreground.overlay.stableKey, accent.overlay.stableKey].join("|"),
					semanticKey: semanticKey(background.rgb, foreground.overlay.rgb, surface.rgb, accent.overlay.rgb, treatment.state),
					changedSemanticBlocks: 0,
					changedSemanticAtoms: 0,
					apcaLc: {
						foregroundOnBackground: foreground.contrast.background.signedLc,
						foregroundOnSurface: foreground.contrast.surface.signedLc,
						accentOnBackground: accent.contrast.background.signedLc,
						accentOnSurface: accent.contrast.surface.signedLc,
					},
				}
				selection.changedSemanticBlocks = semanticBlocks(selection, canonical)
				selection.changedSemanticAtoms = semanticChanges(selection, canonical)
				if (selection.changedSemanticAtoms === 0) continue
				admittedCompleteTuples++
				admittedSelections.push(selection)
				const dominated = completeFrontier.some((existing) => dominates(existing.objectives, objectives))
				if (dominated) continue
				completeFrontier = completeFrontier.filter((existing) => !dominates(objectives, existing.objectives))
				completeFrontier.push(selection)
			}
		}
	}
	const minimumBlocks = admittedSelections.length === 0 ? Infinity :
		Math.min(...admittedSelections.map((selection) => selection.changedSemanticBlocks))
	let preferred = admittedSelections.filter((selection) => selection.changedSemanticBlocks === minimumBlocks)
	preferred = preferred.filter((candidate) => !preferred.some((other) =>
		other !== candidate && dominates(other.objectives, candidate.objectives)))
	preferred.sort((first, second) => first.changedSemanticAtoms - second.changedSemanticAtoms ||
		compareAscii(first.semanticKey, second.semanticKey) ||
		compareAscii(first.stableKey, second.stableKey))
	completeFrontier.sort((first, second) => first.changedSemanticBlocks - second.changedSemanticBlocks ||
		first.changedSemanticAtoms - second.changedSemanticAtoms || compareAscii(first.semanticKey, second.semanticKey) ||
		compareAscii(first.stableKey, second.stableKey))
	return {
		selection: preferred[0] ?? null,
		preferred,
		completeFrontier,
		witnesses,
		counts: {
			fieldTreatmentsMeetingIncumbent: fieldCandidates.length,
			foregroundPairCandidates,
			accentConditionalFrontierMembers,
			attemptedCompleteTuples,
			admittedCompleteTuples,
			paretoCompleteTuples: completeFrontier.length,
			minimumChangeCompleteTuples: preferred.length,
			pruningWitnesses: witnesses.length,
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
	const reconstructionNodes = evidence.graph.nodes.filter((node) => fieldIds.has(node.id))
	const totalPopulation = reconstructionNodes.reduce((sum, node) => sum + node.population, 0)
	const reconstruction = reconstructionNodes.reduce((sum, node) =>
		sum + node.population * Math.min(...labs.map((lab) => okDistance(node.lab, lab))), 0) /
		Math.max(totalPopulation, epsilon)
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

function gradientEvidence(selection: Selection, canonical: Palette): GradientEvidence {
	if (sameRgb(selection.background.rgb, canonical.background.rgb) && sameRgb(selection.surface.rgb, canonical.surface.rgb) &&
		selection.fieldState === fieldState(canonical) &&
		canonical.gradient.isGradient === (selection.fieldState === "gradient")) return canonical.gradient
	const relation = selection.fieldTreatment.fieldRelation
	if (!relation) return { isGradient: false, confidence: selection.fieldTreatment.stateSupport, coverage: 0, continuity: 0, coherence: 0 }
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
		gradient: gradientEvidence(selection, canonical),
		score: canonical.score,
		metrics: metrics(selection, evidence),
	}
}

function canonicalRoles(canonical: Palette): NextPaletteJointParetoCertificate["selected"]["roles"] {
	return Object.fromEntries(roleNames.map((role) => [role, canonical[role].generated ? {
		stableKey: "canonical-generated" as const,
		rgb: canonical[role].rgb,
		kind: "canonical-generated" as const,
	} : {
		stableKey: `canonical:${role}:${canonical[role].hex}`,
		rgb: canonical[role].rgb,
		representativePixelIndex: -1,
		supportMaskSha256: "canonical-incumbent",
		kind: "field-candidate" as const,
	}])) as NextPaletteJointParetoCertificate["selected"]["roles"]
}

export function extractNextPaletteJointParetoWithContext(image: RawImage): NextPaletteJointParetoContext {
	const canonicalContext = extractPaletteWithContext(image)
	if (canonicalContext.extraction.version !== ALGORITHM_VERSION) throw new Error("Joint Pareto incumbent is not canonical 0.19")
	const canonical = canonicalContext.extraction.methods.spatial
	const evidence = buildJointPaletteEvidence(image)
	const incumbent = canonicalEvidence(canonical, evidence)
	const main = select(canonical, evidence, incumbent)
	const selection = main.selection
	const palette = selection ? toPalette(selection, canonical, evidence) : canonical
	if (!selection && !isDeepStrictEqual(palette, canonical)) throw new Error("Joint Pareto fallback is not exact canonical")
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
	const ablations = Object.fromEntries(Object.entries(ablationConstraints).map(([name, constraints]) => {
		const ablated = select(canonical, evidence, incumbent, constraints)
		return [name, selectionSummary(ablated.selection, canonical, incumbent)]
	})) as Record<NextPaletteJointAblationName, NextPaletteJointSelectionSummary>
	const selectedSummary = selectionSummary(selection, canonical, incumbent)
	const selectedRoles = selection ? {
		background: roleProvenance(selection.background),
		foreground: overlayProvenance(selection.foreground),
		surface: roleProvenance(selection.surface),
		accent: overlayProvenance(selection.accent),
	} : canonicalRoles(canonical)
	const selectedApca = selection?.apcaLc ?? {
		foregroundOnBackground: apcaContrast(canonical.foreground.rgb, canonical.background.rgb),
		foregroundOnSurface: apcaContrast(canonical.foreground.rgb, canonical.surface.rgb),
		accentOnBackground: apcaContrast(canonical.accent.rgb, canonical.background.rgb),
		accentOnSurface: apcaContrast(canonical.accent.rgb, canonical.surface.rgb),
	}
	if (Object.values(selectedApca).some((value) => !Number.isFinite(value))) throw new Error("Joint Pareto selected APCA is non-finite")
	const minimumBlockFrontier = main.preferred.map((entry): NextPaletteJointFrontierEntry => ({
		...selectionSummary(entry, canonical, incumbent),
		changedBlocks: changedBlocks(entry, canonical),
		roles: {
			background: entry.background.rgb,
			foreground: entry.foreground.rgb,
			surface: entry.surface.rgb,
			accent: entry.accent.rgb,
		},
	}))
	const completeTupleFrontier = main.completeFrontier.map((entry): NextPaletteJointFrontierEntry => ({
		...selectionSummary(entry, canonical, incumbent),
		changedBlocks: changedBlocks(entry, canonical),
		roles: {
			background: entry.background.rgb,
			foreground: entry.foreground.rgb,
			surface: entry.surface.rgb,
			accent: entry.accent.rgb,
		},
	}))
	const completeFieldDomain = fieldTreatmentsWithCanonicalSeed(canonical, evidence)
	const witnessBytes = JSON.stringify(main.witnesses)
	const certificate: NextPaletteJointParetoCertificate = {
		schemaVersion: 1,
		algorithmVersion: NEXT_PALETTE_JOINT_PARETO_ALGORITHM_VERSION,
		incumbentAlgorithmVersion: ALGORITHM_VERSION,
		policy: NEXT_PALETTE_JOINT_PARETO_POLICY,
		incumbent: {
			evidenceAvailable: incumbent.available,
			unavailableReasons: incumbent.reasons,
			fieldState: incumbent.state,
			objectives: incumbent.objectives,
			stableKey: incumbent.stableKey,
		},
		counts: {
			fieldNodes: evidence.counts.fieldNodes,
			fieldTreatments: completeFieldDomain.length,
			canonicalSeededFieldTreatments: completeFieldDomain.filter((treatment) =>
				treatment.stableKey.startsWith("canonical-seed:")).length,
			overlayAlternatives: evidence.counts.overlayAlternatives,
			logicalCompleteTuples: completeFieldDomain.length * evidence.overlays.length ** 2,
			...main.counts,
		},
		pruning: {
			witnessSha256: createHash("sha256").update(witnessBytes).digest("hex"),
			incumbentThresholdPruningIsLossless: true,
			roleParetoPruningIsLossless: true,
		},
		selected: {
			...selectedSummary,
			roles: selectedRoles,
			apcaLc: selectedApca,
			fieldTreatment: selection?.fieldTreatment ?? null,
		},
		minimumBlockFrontier,
		completeTupleFrontier,
		ablations,
		invariants: {
			canonicalIncumbentAlwaysAvailable: true,
			sourceExactChallengersOnly: true,
			maximumFourColors: true,
			explicitFieldState: true,
			explicitAccentCollapse: true,
			foregroundFieldCollapseAbsent: true,
			accentFieldCollapseAbsent: true,
			finiteSignedApca: true,
			fixedApcaFloorAbsent: true,
			completeTupleParetoComparison: true,
			incumbentPreservingChangePriority: true,
			fieldTreatmentIsOneSemanticBlock: true,
			noPostselectionMutation: true,
			unchangedIsExactCanonical: true,
		},
	}
	return deepFreeze({
		palette,
		certificate,
		canonicalExtraction: canonicalContext.extraction,
		evidence,
	})
}

export function extractNextPaletteJointPareto(image: RawImage): NextPaletteJointParetoResult {
	const { canonicalExtraction: _canonicalExtraction, evidence: _evidence, ...result } =
		extractNextPaletteJointParetoWithContext(image)
	return result
}
