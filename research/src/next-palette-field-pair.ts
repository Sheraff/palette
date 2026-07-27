import {
	apcaContrast,
	contrastRatio,
	okDistance,
	rgbToHex,
	rgbToOKLab,
	roleMinimumDistance,
} from "./color.ts"
import { GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY } from "./gradient-field-topology-model.ts"
import type { PaletteEvidenceEdge, PaletteEvidenceGraph, PaletteEvidenceNode } from "./palette-evidence-graph.ts"
import { buildPaletteEvidenceGraph, PALETTE_EVIDENCE_GRAPH_VERSION } from "./palette-evidence-graph.ts"
import {
	NEXT_PALETTE_DEVELOPMENT_POLICY,
	type NextPaletteCandidateId,
	type NextPaletteGradientState,
	type NextPaletteHardConstraintRejections,
	type NextPalettePolicy,
} from "./next-palette.ts"
import {
	PALETTE_PERCEPTION_VERSION,
	perceivePaletteImage,
	type PalettePerception,
} from "./palette-perception.ts"
import type { GradientEvidence, Palette, PaletteMetrics, RawImage, RGB, RoleColor, RoleName } from "./types.ts"

export const NEXT_PALETTE_FIELD_PAIR_ALGORITHM_VERSION = "region-graph-next-0.2.0-dev"

export const NEXT_PALETTE_FIELD_PAIR_IDENTITY = Object.freeze({
	algorithmVersion: NEXT_PALETTE_FIELD_PAIR_ALGORITHM_VERSION,
	perceptionVersion: PALETTE_PERCEPTION_VERSION,
	evidenceGraphVersion: PALETTE_EVIDENCE_GRAPH_VERSION,
	gradientTopologyModel: Object.freeze({
		modelVersion: GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.modelVersion,
		evidenceVersion: GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.evidenceVersion,
		parameterSha256: GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.parameterSha256,
	}),
	candidateConstruction: Object.freeze({
		count: 12,
		roleAware: true,
		lightnessBins: 32,
		aBins: 24,
		bBins: 24,
		maximumLloydIterations: 8,
		movementStop: 0.0001,
		familyRadius: 0.055,
		familyAnchorOrder: "population-descending-then-exact-rgb-ascending-then-candidate-id",
	}),
	selection: "minimum-maximum-deficit-then-total-deficit-then-semantic-key",
	comparisonEpsilon: 1e-12,
	objectiveNames: Object.freeze([
		"fieldRepresentativeness",
		"foregroundSupport",
		"orderedFieldPairSupport",
		"accentIdentitySupport",
		"representedFamilyCoverage",
		"gradientStateConsistency",
	] as const),
	objectiveFormulas: Object.freeze([
		"mean(clamp01(background), clamp01(spatial.field), clamp01(familySpatial.field), clamp01(sqrt(population / max(source population, 1e-12))))",
		"generated ? 0 : mean(clamp01(text), clamp01(saliency), clamp01(spatial.detail), clamp01(familySpatial.detail), clamp01(sqrt(population / max(source population, 1e-12))))",
		"distinct ? 1 - (1 - clamp01(endpoint support) * clamp01(absolute pair coverage)) * (1 - clamp01(field ownership)) : 1 - max(ordered field-pair support of every distance-, foreground-APCA-, accent-APCA-, accent-distance-, and cardinality-feasible distinct surface)",
		"distinct ? mean(clamp01(chroma / max(source chroma, 1e-12)), clamp01(saliency), max(clamp01(spatial.detail), clamp01(familySpatial.detail)), clamp01(sqrt(population / max(source population, 1e-12)))) : 1 - max(identity support of every APCA-, distance-, and cardinality-feasible distinct source accent)",
		"clamp01(sum(familySpatial.population for unique selected source family IDs))",
		"collapsed flat ? 1 : gradient model score for gradient and its complement for flat",
	] as const),
} as const)

export type NextPaletteFieldPairObjectiveVector = readonly [
	fieldRepresentativeness: number,
	foregroundSupport: number,
	orderedFieldPairSupport: number,
	accentIdentitySupport: number,
	representedFamilyCoverage: number,
	gradientStateConsistency: number,
]

export type NextPaletteFieldPairCertificate = {
	schemaVersion: 1
	algorithmVersion: typeof NEXT_PALETTE_FIELD_PAIR_ALGORITHM_VERSION
	identity: typeof NEXT_PALETTE_FIELD_PAIR_IDENTITY
	policy: Readonly<NextPalettePolicy>
	counts: {
		fieldPairs: number
		authorizedFieldPairs: number
		sourceForegroundFieldPairs: number
		fallbackForegroundFieldPairs: number
		completeDomain: number
		attempted: number
		feasible: number
	}
	hardConstraintRejections: NextPaletteHardConstraintRejections
	selected: {
		candidateIds: Record<RoleName, NextPaletteCandidateId>
		familyIds: Record<RoleName, number | null>
		gradientState: NextPaletteGradientState
		objectives: NextPaletteFieldPairObjectiveVector
		maximumDeficit: number
		totalDeficit: number
		stableKey: string
		apcaLc: {
			foregroundOnBackground: number
			foregroundOnSurface: number
			accentOnBackground: number
			accentOnSurface: number
		}
		fieldEdge?: PaletteEvidenceEdge
	}
	invariants: {
		completeTupleEnumeration: true
		signedApcaHardConstraints: true
		explicitSurfaceCollapse: true
		explicitAccentCollapse: true
		jointGradientState: true
		orderedFieldPairObjective: true
		noPostselectionMutation: true
	}
}

export type NextPaletteFieldPairResult = {
	palette: Palette
	certificate: NextPaletteFieldPairCertificate
}

export type NextPaletteFieldPairContext = NextPaletteFieldPairResult & {
	perception: PalettePerception
	graph: PaletteEvidenceGraph
}

type GeneratedColor = {
	id: "generated-black" | "generated-white"
	stableKey: string
	rgb: RGB
	lab: ReturnType<typeof rgbToOKLab>
	hex: string
	generated: true
	familyId: null
	node?: undefined
}

type SourceColor = {
	id: number
	stableKey: string
	rgb: RGB
	lab: PaletteEvidenceNode["lab"]
	hex: string
	generated: false
	familyId: number
	node: PaletteEvidenceNode
}

type SolverColor = GeneratedColor | SourceColor

type Selection = {
	background: SourceColor
	foreground: SolverColor
	surface: SourceColor
	accent: SolverColor
	gradientState: NextPaletteGradientState
	objectives: NextPaletteFieldPairObjectiveVector
	maximumDeficit: number
	totalDeficit: number
	stableKey: string
	fieldEdge?: PaletteEvidenceEdge
}

const epsilon = 1e-12

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value
	for (const child of Object.values(value)) deepFreeze(child)
	return Object.freeze(value)
}

function clamp01(value: number): number {
	if (!Number.isFinite(value)) return 0
	return Math.max(0, Math.min(1, value))
}

function mean(values: readonly number[]): number {
	return values.length === 0 ? 0 : clamp01(values.reduce((sum, value) => sum + clamp01(value), 0) / values.length)
}

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function sourceColor(node: PaletteEvidenceNode): SourceColor {
	return {
		id: node.id,
		stableKey: node.stableKey,
		rgb: node.rgb,
		lab: node.lab,
		hex: node.hex,
		generated: false,
		familyId: node.familyId,
		node,
	}
}

function generatedColor(id: GeneratedColor["id"], rgb: RGB): GeneratedColor {
	return {
		id,
		stableKey: `${rgbToHex(rgb)}:generated`,
		rgb,
		lab: rgbToOKLab(rgb),
		hex: rgbToHex(rgb),
		generated: true,
		familyId: null,
	}
}

function assertPolicy(policy: NextPalettePolicy): Readonly<NextPalettePolicy> {
	const expectedKeys = [
		"version",
		"foregroundDarkOnLightMinimumLc",
		"foregroundLightOnDarkMinimumMagnitudeLc",
		"accentDarkOnLightMinimumLc",
		"accentLightOnDarkMinimumMagnitudeLc",
		"distinctFieldMinimumDistance",
		"distinctAccentFieldMinimumDistance",
		"maximumDistinctRoleColors",
	].sort()
	const actualKeys = Object.keys(policy).sort()
	if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
		throw new Error("Next palette field-pair policy must contain exactly the versioned consumer constraint fields")
	}
	if (typeof policy.version !== "string" || policy.version.length === 0) {
		throw new Error("Next palette field-pair policy version must be a non-empty string")
	}
	for (const [name, value] of Object.entries(policy)) {
		if (name === "version") continue
		if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
			throw new Error(`Next palette field-pair policy ${name} must be a finite non-negative number`)
		}
	}
	if (!Number.isInteger(policy.maximumDistinctRoleColors) || policy.maximumDistinctRoleColors < 1 ||
		policy.maximumDistinctRoleColors > 4) {
		throw new Error("Next palette field-pair policy maximumDistinctRoleColors must be an integer within [1, 4]")
	}
	return Object.freeze({ ...policy })
}

function passesSignedApca(lc: number, positiveMinimum: number, negativeMinimumMagnitude: number): boolean {
	return lc >= positiveMinimum || lc <= -negativeMinimumMagnitude
}

function rgbKey(rgb: RGB): string {
	return `${rgb[0]},${rgb[1]},${rgb[2]}`
}

function distinctColorCount(colors: readonly SolverColor[]): number {
	return new Set(colors.map((color) => rgbKey(color.rgb))).size
}

function componentDetail(node: PaletteEvidenceNode): number {
	return Math.max(clamp01(node.spatial.detail), clamp01(node.familySpatial.detail))
}

function fieldSupport(node: PaletteEvidenceNode, maximumPopulation: number): number {
	return mean([
		node.background,
		node.spatial.field,
		node.familySpatial.field,
		Math.sqrt(node.population / Math.max(maximumPopulation, epsilon)),
	])
}

export function orderedFieldPairSupport(edge: PaletteEvidenceEdge): number {
	if (!edge.field) throw new Error("Ordered field-pair support requires topology evidence")
	const endpoint = clamp01(edge.field.topology.features.endpointSupport)
	const endpointMass = endpoint * clamp01(edge.field.topology.histogram.absolutePairCoverage)
	const ownership = clamp01(edge.field.topology.features.fieldOwnership)
	return clamp01(1 - (1 - endpointMass) * (1 - ownership))
}

function foregroundSupport(color: SolverColor, maximumPopulation: number): number {
	if (color.generated) return 0
	const node = color.node
	return mean([
		node.text,
		node.saliency,
		node.spatial.detail,
		node.familySpatial.detail,
		Math.sqrt(node.population / Math.max(maximumPopulation, epsilon)),
	])
}

function accentIdentitySupport(color: SolverColor, maximumPopulation: number, maximumChroma: number): number {
	if (color.generated) return 0
	const node = color.node
	return mean([
		node.chroma / Math.max(maximumChroma, epsilon),
		node.saliency,
		componentDetail(node),
		Math.sqrt(node.population / Math.max(maximumPopulation, epsilon)),
	])
}

function familyCoverage(colors: readonly SolverColor[]): number {
	const seen = new Set<number>()
	let coverage = 0
	for (const color of colors) {
		if (color.generated || seen.has(color.familyId)) continue
		seen.add(color.familyId)
		coverage += color.node.family.spatial.population
	}
	return clamp01(coverage)
}

function selectionKey(
	background: SourceColor,
	foreground: SolverColor,
	surface: SourceColor,
	accent: SolverColor,
	gradientState: NextPaletteGradientState,
): string {
	return [background.stableKey, foreground.stableKey, surface.stableKey, accent.stableKey, gradientState].join("|")
}

function isBetter(candidate: Selection, current: Selection | undefined): boolean {
	if (!current) return true
	if (candidate.maximumDeficit < current.maximumDeficit - epsilon) return true
	if (candidate.maximumDeficit > current.maximumDeficit + epsilon) return false
	if (candidate.totalDeficit < current.totalDeficit - epsilon) return true
	if (candidate.totalDeficit > current.totalDeficit + epsilon) return false
	return compareAscii(candidate.stableKey, current.stableKey) < 0
}

function roleColor(color: SolverColor, sourceNodes: readonly PaletteEvidenceNode[]): RoleColor {
	return {
		rgb: color.rgb,
		hex: color.hex,
		generated: color.generated,
		sourceDistance: color.generated
			? sourceNodes.reduce((nearest, node) => Math.min(nearest, okDistance(color.lab, node.lab)), Infinity)
			: 0,
	}
}

function paletteMetrics(selection: Selection, sourceNodes: readonly PaletteEvidenceNode[]): PaletteMetrics {
	const colors = [selection.background, selection.foreground, selection.surface, selection.accent]
	const primary = sourceNodes.filter((node) => !node.typographyOnly)
	const totalPopulation = primary.reduce((sum, node) => sum + node.population, 0)
	const reconstruction = primary.reduce((sum, node) =>
		sum + node.population * Math.min(...colors.map((color) => okDistance(node.lab, color.lab))), 0) /
		Math.max(totalPopulation, epsilon)
	const sourceDistances = colors.map((color) => color.generated
		? sourceNodes.reduce((nearest, node) => Math.min(nearest, okDistance(color.lab, node.lab)), Infinity)
		: 0)
	return {
		foregroundContrast: contrastRatio(selection.foreground.rgb, selection.background.rgb),
		foregroundSurfaceContrast: contrastRatio(selection.foreground.rgb, selection.surface.rgb),
		accentContrast: contrastRatio(selection.accent.rgb, selection.background.rgb),
		accentSurfaceContrast: contrastRatio(selection.accent.rgb, selection.surface.rgb),
		minimumRoleDistance: roleMinimumDistance(colors.map((color) => color.lab)),
		meanSourceDistance: sourceDistances.reduce((sum, value) => sum + value, 0) / sourceDistances.length,
		meanReconstructionError: reconstruction,
	}
}

function gradientEvidence(selection: Selection): GradientEvidence {
	if (!selection.fieldEdge?.field) {
		return { isGradient: false, confidence: 1, coverage: 0, continuity: 0, coherence: 0 }
	}
	const { topology, model } = selection.fieldEdge.field
	return {
		isGradient: selection.gradientState === "gradient",
		confidence: selection.gradientState === "gradient" ? model.score : 1 - model.score,
		coverage: topology.histogram.absolutePairCoverage,
		continuity: topology.features.distributionContinuity,
		coherence: topology.features.connectedIntermediateContinuity,
	}
}

function toPalette(selection: Selection, sourceNodes: readonly PaletteEvidenceNode[]): Palette {
	return {
		background: roleColor(selection.background, sourceNodes),
		foreground: roleColor(selection.foreground, sourceNodes),
		surface: roleColor(selection.surface, sourceNodes),
		accent: roleColor(selection.accent, sourceNodes),
		gradient: gradientEvidence(selection),
		score: clamp01(1 - selection.maximumDeficit),
		metrics: paletteMetrics(selection, sourceNodes),
	}
}

function increment(rejections: NextPaletteHardConstraintRejections, reason: keyof NextPaletteHardConstraintRejections): false {
	rejections[reason]++
	return false
}

export function solveNextPaletteFieldPair(
	graph: PaletteEvidenceGraph,
	requestedPolicy: NextPalettePolicy = NEXT_PALETTE_DEVELOPMENT_POLICY,
): NextPaletteFieldPairResult {
	if (graph.version !== PALETTE_EVIDENCE_GRAPH_VERSION) {
		throw new Error(`Unexpected palette evidence graph version: ${String(graph.version)}`)
	}
	if (graph.perceptionVersion !== PALETTE_PERCEPTION_VERSION) {
		throw new Error(`Unexpected palette perception version: ${String(graph.perceptionVersion)}`)
	}
	const policy = assertPolicy(requestedPolicy)
	const nodes = [...graph.nodes].sort((first, second) => compareAscii(first.stableKey, second.stableKey))
	const nodeIds = new Set(nodes.map((node) => node.id))
	if (nodeIds.size !== nodes.length) throw new Error("Cannot infer a palette from duplicate evidence node IDs")
	const fieldNodes = nodes.filter((node) => !node.typographyOnly)
	if (fieldNodes.length === 0) throw new Error("Cannot infer a palette without a non-typography source field")

	const edges = new Map(graph.edges.map((edge) => [`${edge.fromId}>${edge.toId}`, edge]))
	const edge = (from: PaletteEvidenceNode, to: PaletteEvidenceNode): PaletteEvidenceEdge => {
		const value = edges.get(`${from.id}>${to.id}`)
		if (!value) throw new Error(`Missing directed palette evidence edge ${from.id}>${to.id}`)
		return value
	}
	const contrastLc = (foreground: SolverColor, background: SourceColor): number =>
		foreground.generated || foreground.id === background.id
			? apcaContrast(foreground.rgb, background.rgb)
			: edge(foreground.node, background.node).apcaLc
	const passesForeground = (foreground: SolverColor, background: SourceColor, surface: SourceColor): boolean =>
		passesSignedApca(
			contrastLc(foreground, background),
			policy.foregroundDarkOnLightMinimumLc,
			policy.foregroundLightOnDarkMinimumMagnitudeLc,
		) && passesSignedApca(
			contrastLc(foreground, surface),
			policy.foregroundDarkOnLightMinimumLc,
			policy.foregroundLightOnDarkMinimumMagnitudeLc,
		)
	const passesAccent = (accent: SolverColor, background: SourceColor, surface: SourceColor): boolean =>
		passesSignedApca(
			contrastLc(accent, background),
			policy.accentDarkOnLightMinimumLc,
			policy.accentLightOnDarkMinimumMagnitudeLc,
		) && passesSignedApca(
			contrastLc(accent, surface),
			policy.accentDarkOnLightMinimumLc,
			policy.accentLightOnDarkMinimumMagnitudeLc,
		)

	const generated = [
		generatedColor("generated-black", [0, 0, 0]),
		generatedColor("generated-white", [255, 255, 255]),
	] as const
	const maximumPopulation = Math.max(...nodes.map((node) => node.population))
	const maximumChroma = Math.max(...nodes.map((node) => node.chroma))
	const rejections: NextPaletteHardConstraintRejections = {
		surfaceDistance: 0,
		foregroundApca: 0,
		foregroundFallbackApca: 0,
		accentApca: 0,
		accentDistance: 0,
		roleMembership: 0,
		sourceProvenance: 0,
		gradientLegality: 0,
		cardinality: 0,
	}
	const counts = {
		fieldPairs: fieldNodes.length ** 2,
		authorizedFieldPairs: 0,
		sourceForegroundFieldPairs: 0,
		fallbackForegroundFieldPairs: 0,
		completeDomain: 0,
		attempted: 0,
		feasible: 0,
	}
	let best: Selection | undefined

	for (const backgroundNode of fieldNodes) {
		const background = sourceColor(backgroundNode)
		for (const surfaceNode of fieldNodes) {
			const surface = sourceColor(surfaceNode)
			const collapsedSurface = background.id === surface.id
			const fieldDistancePasses = collapsedSurface ||
				edge(backgroundNode, surfaceNode).distance >= policy.distinctFieldMinimumDistance
			if (fieldDistancePasses) counts.authorizedFieldPairs++

			const sourceForegrounds = nodes.map(sourceColor)
			const hasPassingSourceForeground = sourceForegrounds.some((candidate) =>
				passesForeground(candidate, background, surface))
			if (hasPassingSourceForeground) counts.sourceForegroundFieldPairs++
			else counts.fallbackForegroundFieldPairs++
			const foregrounds: SolverColor[] = hasPassingSourceForeground
				? sourceForegrounds
				: [...sourceForegrounds, ...generated]

			for (const foreground of foregrounds) {
				const sourceAccents = nodes.map(sourceColor)
				const accents: SolverColor[] = foreground.generated ? [foreground, ...sourceAccents] : sourceAccents
				const gradientStates: NextPaletteGradientState[] = collapsedSurface ? ["flat"] : ["flat", "gradient"]

				for (const accent of accents) {
					for (const gradientState of gradientStates) {
						counts.completeDomain++
						counts.attempted++
						if (background.node.typographyOnly || surface.node.typographyOnly) {
							increment(rejections, "roleMembership")
							continue
						}
						if (!fieldDistancePasses) {
							increment(rejections, "surfaceDistance")
							continue
						}
						if ((!foreground.generated && foreground.node.candidate.generated) ||
							foreground.generated && hasPassingSourceForeground) {
							increment(rejections, "sourceProvenance")
							continue
						}
						if ((!accent.generated && accent.node.candidate.generated) ||
							accent.generated && accent.stableKey !== foreground.stableKey) {
							increment(rejections, "sourceProvenance")
							continue
						}
						if (!passesForeground(foreground, background, surface)) {
							increment(rejections, foreground.generated ? "foregroundFallbackApca" : "foregroundApca")
							continue
						}
						if (!passesAccent(accent, background, surface)) {
							increment(rejections, "accentApca")
							continue
						}
						if (okDistance(accent.lab, background.lab) < policy.distinctAccentFieldMinimumDistance ||
							okDistance(accent.lab, surface.lab) < policy.distinctAccentFieldMinimumDistance) {
							increment(rejections, "accentDistance")
							continue
						}
						if (collapsedSurface && gradientState !== "flat") {
							increment(rejections, "gradientLegality")
							continue
						}
						if (distinctColorCount([background, foreground, surface, accent]) > policy.maximumDistinctRoleColors) {
							increment(rejections, "cardinality")
							continue
						}
						counts.feasible++

						const fieldEdge = collapsedSurface ? undefined : edge(backgroundNode, surfaceNode)
						if (fieldEdge && !fieldEdge.field) throw new Error("Distinct fields lack topology evidence")
						const gradientScore = fieldEdge?.field?.model.score ?? 0
						const strongestDistinctFieldPair = collapsedSurface
							? fieldNodes.reduce((strongest, node) => {
								const alternative = sourceColor(node)
								if (node.id === background.id ||
									okDistance(node.lab, background.lab) < policy.distinctFieldMinimumDistance ||
									!passesForeground(foreground, background, alternative) ||
									!passesAccent(accent, background, alternative) ||
									okDistance(accent.lab, alternative.lab) < policy.distinctAccentFieldMinimumDistance ||
									distinctColorCount([background, foreground, alternative, accent]) >
										policy.maximumDistinctRoleColors) return strongest
								return Math.max(strongest, orderedFieldPairSupport(edge(backgroundNode, node)))
							}, 0)
							: 0
						const accentCollapsed = rgbKey(accent.rgb) === rgbKey(foreground.rgb)
						const strongestDistinctAccent = accentCollapsed
							? nodes.reduce((strongest, node) => {
								const alternative = sourceColor(node)
								if (rgbKey(alternative.rgb) === rgbKey(foreground.rgb) ||
									!passesAccent(alternative, background, surface) ||
									okDistance(alternative.lab, background.lab) < policy.distinctAccentFieldMinimumDistance ||
									okDistance(alternative.lab, surface.lab) < policy.distinctAccentFieldMinimumDistance ||
									distinctColorCount([background, foreground, surface, alternative]) >
										policy.maximumDistinctRoleColors) return strongest
								return Math.max(strongest, accentIdentitySupport(alternative, maximumPopulation, maximumChroma))
							}, 0)
							: 0
						const objectives: NextPaletteFieldPairObjectiveVector = [
							fieldSupport(backgroundNode, maximumPopulation),
							foregroundSupport(foreground, maximumPopulation),
							collapsedSurface ? 1 - strongestDistinctFieldPair : orderedFieldPairSupport(fieldEdge!),
							accentCollapsed
								? 1 - strongestDistinctAccent
								: accentIdentitySupport(accent, maximumPopulation, maximumChroma),
							familyCoverage([background, foreground, surface, accent]),
							collapsedSurface ? 1 : gradientState === "gradient" ? gradientScore : 1 - gradientScore,
						]
						const deficits = objectives.map((objective) => 1 - clamp01(objective))
						const selection: Selection = {
							background,
							foreground,
							surface,
							accent,
							gradientState,
							objectives,
							maximumDeficit: Math.max(...deficits),
							totalDeficit: deficits.reduce((sum, deficit) => sum + deficit, 0),
							stableKey: selectionKey(background, foreground, surface, accent, gradientState),
							fieldEdge,
						}
						if (isBetter(selection, best)) best = selection
					}
				}
			}
		}
	}

	if (!best) throw new Error("No complete palette satisfies the next palette field-pair policy")
	const selectedApca = {
		foregroundOnBackground: contrastLc(best.foreground, best.background),
		foregroundOnSurface: contrastLc(best.foreground, best.surface),
		accentOnBackground: contrastLc(best.accent, best.background),
		accentOnSurface: contrastLc(best.accent, best.surface),
	}
	const certificate: NextPaletteFieldPairCertificate = {
		schemaVersion: 1,
		algorithmVersion: NEXT_PALETTE_FIELD_PAIR_ALGORITHM_VERSION,
		identity: NEXT_PALETTE_FIELD_PAIR_IDENTITY,
		policy,
		counts,
		hardConstraintRejections: rejections,
		selected: {
			candidateIds: {
				background: best.background.id,
				foreground: best.foreground.id,
				surface: best.surface.id,
				accent: best.accent.id,
			},
			familyIds: {
				background: best.background.familyId,
				foreground: best.foreground.familyId,
				surface: best.surface.familyId,
				accent: best.accent.familyId,
			},
			gradientState: best.gradientState,
			objectives: best.objectives,
			maximumDeficit: best.maximumDeficit,
			totalDeficit: best.totalDeficit,
			stableKey: best.stableKey,
			apcaLc: selectedApca,
			fieldEdge: best.fieldEdge,
		},
		invariants: {
			completeTupleEnumeration: true,
			signedApcaHardConstraints: true,
			explicitSurfaceCollapse: true,
			explicitAccentCollapse: true,
			jointGradientState: true,
			orderedFieldPairObjective: true,
			noPostselectionMutation: true,
		},
	}
	return deepFreeze({ palette: toPalette(best, nodes), certificate })
}

export function extractNextPaletteFieldPairWithContext(
	image: RawImage,
	policy: NextPalettePolicy = NEXT_PALETTE_DEVELOPMENT_POLICY,
): NextPaletteFieldPairContext {
	const perception = perceivePaletteImage(image)
	const graph = buildPaletteEvidenceGraph(perception)
	return deepFreeze({ ...solveNextPaletteFieldPair(graph, policy), perception, graph })
}

export function extractNextPaletteFieldPair(
	image: RawImage,
	policy: NextPalettePolicy = NEXT_PALETTE_DEVELOPMENT_POLICY,
): NextPaletteFieldPairResult {
	const { palette, certificate } = extractNextPaletteFieldPairWithContext(image, policy)
	return deepFreeze({ palette, certificate })
}
