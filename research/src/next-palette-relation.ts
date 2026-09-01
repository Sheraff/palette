import {
	apcaContrast,
	contrastRatio,
	okDistance,
	rgbToHex,
	rgbToOKLab,
	roleMinimumDistance,
} from "./color.ts"
import { FIELD_RELATION_EVIDENCE_VERSION } from "./field-relation.ts"
import {
	PALETTE_RELATION_GRAPH_VERSION,
	buildPaletteRelationGraph,
	type PaletteRelationEdge,
	type PaletteRelationGraph,
	type PaletteRelationNode,
} from "./palette-relation-graph.ts"
import {
	PALETTE_PERCEPTION_VERSION,
	perceivePaletteImage,
	type PalettePerception,
} from "./palette-perception.ts"
import type { GradientEvidence, Palette, PaletteMetrics, RawImage, RGB, RoleColor, RoleName } from "./types.ts"

export const NEXT_PALETTE_RELATION_ALGORITHM_VERSION = "region-graph-next-0.3.0-dev"
export const nextPaletteRelationFieldRoles = ["background", "surface"] as const
export const nextPaletteRelationOverlayRoles = ["foreground", "accent"] as const

export type NextPaletteRelationFieldRole = typeof nextPaletteRelationFieldRoles[number]
export type NextPaletteRelationOverlayRole = typeof nextPaletteRelationOverlayRoles[number]
export type NextPaletteRequiredFieldRoles =
	| readonly ["background"]
	| readonly ["surface"]
	| readonly ["background", "surface"]

export type NextPaletteRelationPolicy = {
	version: string
	requiredApcaRelations: Readonly<Record<NextPaletteRelationOverlayRole, NextPaletteRequiredFieldRoles>>
	foregroundDarkOnLightMinimumLc: number
	foregroundLightOnDarkMinimumMagnitudeLc: number
	accentDarkOnLightMinimumLc: number
	accentLightOnDarkMinimumMagnitudeLc: number
	flatFieldMinimumDistance: number
	distinctAccentFieldMinimumDistance: number
	maximumDistinctRoleColors: number
}

export const NEXT_PALETTE_RELATION_DEVELOPMENT_POLICY: Readonly<NextPaletteRelationPolicy> = Object.freeze({
	version: "next-palette-relation-policy-0.1.0-development",
	requiredApcaRelations: Object.freeze({
		foreground: Object.freeze(["background"] as const),
		accent: Object.freeze(["background"] as const),
	}),
	foregroundDarkOnLightMinimumLc: 60,
	foregroundLightOnDarkMinimumMagnitudeLc: 60,
	accentDarkOnLightMinimumLc: 10,
	accentLightOnDarkMinimumMagnitudeLc: 10,
	flatFieldMinimumDistance: 0.025,
	distinctAccentFieldMinimumDistance: 0.025,
	maximumDistinctRoleColors: 4,
})

export const NEXT_PALETTE_RELATION_IDENTITY = Object.freeze({
	algorithmVersion: NEXT_PALETTE_RELATION_ALGORITHM_VERSION,
	perceptionVersion: PALETTE_PERCEPTION_VERSION,
	relationGraphVersion: PALETTE_RELATION_GRAPH_VERSION,
	fieldRelationEvidenceVersion: FIELD_RELATION_EVIDENCE_VERSION,
	fieldStates: Object.freeze(["collapsed", "distinct-flat", "gradient"] as const),
	fieldEligibility: "source-relative-strict-broad-dominance-with-equal-breadth-preservation",
	conjunction: "zero-preserving-harmonic-mean",
	flatRelation: "H(endpoint mass, H(background field support, surface field support), 1 - max(distribution continuity, progression))",
	gradientRelation: "H(endpoint mass, H(background field support, surface field support), H(distribution continuity, monotone connectivity, progression))",
	collapseRelation: "1 - max(state-specific relation support of every complete feasible distinct alternative)",
	consumerRelationSemantics: "nonempty-canonical-overlay-to-field-apca-adjacency-v1",
	generatedFallbackSemantics: "per-field-pair-iff-no-single-source-foreground-passes-all-required-foreground-relations",
	selection: "minimum-maximum-deficit-then-total-deficit-then-presentation-complexity-then-semantic-key",
	comparisonEpsilon: 1e-12,
	objectiveNames: Object.freeze([
		"backgroundRepresentativeness",
		"foregroundSupport",
		"fieldRelationSupport",
		"accentIdentitySupport",
		"representedFamilyCoverage",
	] as const),
} as const)

export type NextPaletteRelationState = "collapsed" | "distinct-flat" | "gradient"
export type NextPaletteRelationCandidateId = number | "generated-black" | "generated-white"
export type NextPaletteRelationObjectiveVector = readonly [
	backgroundRepresentativeness: number,
	foregroundSupport: number,
	fieldRelationSupport: number,
	accentIdentitySupport: number,
	representedFamilyCoverage: number,
]

export type NextPaletteRelationRejections = {
	flatFieldDistance: number
	gradientEndpointDistance: number
	foregroundApca: number
	foregroundFallbackApca: number
	accentApca: number
	accentDistance: number
	roleMembership: number
	sourceProvenance: number
	stateLegality: number
	cardinality: number
}

export type NextPaletteRelationCertificate = {
	schemaVersion: 2
	algorithmVersion: string
	identity: Readonly<Record<string, unknown> & { objectiveNames: readonly string[] }>
	policy: Readonly<NextPaletteRelationPolicy>
	counts: {
		fieldPairs: number
		fieldPairsWithPassingSourceForeground: number
		fieldPairsWithGeneratedForegroundAuthorization: number
		completeDomain: number
		attempted: number
		feasible: number
	}
	hardConstraintRejections: NextPaletteRelationRejections
	selected: {
		candidateIds: Record<RoleName, NextPaletteRelationCandidateId>
		familyIds: Record<RoleName, number | null>
		fieldState: NextPaletteRelationState
		objectives: NextPaletteRelationObjectiveVector
		maximumDeficit: number
		totalDeficit: number
		stableKey: string
		apcaLc: {
			foregroundOnBackground: number
			foregroundOnSurface: number
			accentOnBackground: number
			accentOnSurface: number
		}
		apcaConstraints: Record<"foregroundOnBackground" | "foregroundOnSurface" |
			"accentOnBackground" | "accentOnSurface", { required: boolean; passesThreshold: boolean }>
		generatedColorAuthorization: {
			foregroundFallback: { authorized: boolean; passingSourceCandidateIds: readonly number[] }
			accentCollapse: { authorized: boolean; candidateId: "generated-black" | "generated-white" | null }
		}
		fieldEdge?: PaletteRelationEdge
	}
	invariants: {
		completeTupleEnumeration: true
		signedApcaHardConstraints: true
		explicitConsumerApcaRelations: true
		undeclaredApcaRelationsDiagnosticOnly: true
		relationScopedGeneratedFallback: true
		explicitSurfaceCollapse: true
		explicitAccentCollapse: true
		jointFieldState: true
		stateSpecificFieldRelation: true
		noPostselectionMutation: true
	}
}

export type NextPaletteRelationResult = { palette: Palette; certificate: NextPaletteRelationCertificate }
export type NextPaletteRelationContext = NextPaletteRelationResult & {
	perception: PalettePerception
	graph: PaletteRelationGraph
}

export type NextPaletteRelationRuntime = {
	algorithmVersion: string
	identity: NextPaletteRelationCertificate["identity"]
	graphVersion: PaletteRelationGraph["version"]
	perceptionVersion: PaletteRelationGraph["perceptionVersion"]
	familyCoverage: "summed-family-population" | "union-of-family-masks" | "role-local-overlay-evidence"
	reconstructionPopulation: "all-nodes" | "field-source-partition"
}

export const NEXT_PALETTE_RELATION_RUNTIME: Readonly<NextPaletteRelationRuntime> = Object.freeze({
	algorithmVersion: NEXT_PALETTE_RELATION_ALGORITHM_VERSION,
	identity: NEXT_PALETTE_RELATION_IDENTITY,
	graphVersion: PALETTE_RELATION_GRAPH_VERSION,
	perceptionVersion: PALETTE_PERCEPTION_VERSION,
	familyCoverage: "summed-family-population",
	reconstructionPopulation: "all-nodes",
})

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
	lab: PaletteRelationNode["lab"]
	hex: string
	generated: false
	familyId: number
	node: PaletteRelationNode
}
type SolverColor = GeneratedColor | SourceColor
type Selection = {
	background: SourceColor
	foreground: SolverColor
	surface: SourceColor
	accent: SolverColor
	fieldState: NextPaletteRelationState
	objectives: NextPaletteRelationObjectiveVector
	maximumDeficit: number
	totalDeficit: number
	stableKey: string
	fieldEdge?: PaletteRelationEdge
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

function sourceColor(node: PaletteRelationNode): SourceColor {
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

function assertRequiredFields(value: unknown, role: NextPaletteRelationOverlayRole): NextPaletteRequiredFieldRoles {
	if (!Array.isArray(value)) throw new Error(`Next palette relation policy ${role} relations must be an array`)
	const canonical = value.length === 1 && (value[0] === "background" || value[0] === "surface") ||
		value.length === 2 && value[0] === "background" && value[1] === "surface"
	if (!canonical) {
		throw new Error(`Next palette relation policy ${role} relations must be canonical and non-empty`)
	}
	return Object.freeze([...value]) as NextPaletteRequiredFieldRoles
}

function assertPolicy(requested: NextPaletteRelationPolicy): Readonly<NextPaletteRelationPolicy> {
	if (!requested || typeof requested !== "object" || Array.isArray(requested)) {
		throw new Error("Next palette relation policy must be an object")
	}
	const expectedKeys = [
		"version", "requiredApcaRelations", "foregroundDarkOnLightMinimumLc",
		"foregroundLightOnDarkMinimumMagnitudeLc", "accentDarkOnLightMinimumLc",
		"accentLightOnDarkMinimumMagnitudeLc", "flatFieldMinimumDistance",
		"distinctAccentFieldMinimumDistance", "maximumDistinctRoleColors",
	].sort()
	const actualKeys = Object.keys(requested).sort()
	if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
		throw new Error("Next palette relation policy fields are invalid")
	}
	if (typeof requested.version !== "string" || requested.version.trim().length === 0) {
		throw new Error("Next palette relation policy version must be non-empty")
	}
	const relationValue = requested.requiredApcaRelations as unknown
	if (!relationValue || typeof relationValue !== "object" || Array.isArray(relationValue)) {
		throw new Error("Next palette relation policy APCA relations are invalid")
	}
	const relationRecord = relationValue as Record<string, unknown>
	if (Object.keys(relationRecord).sort().join(",") !== "accent,foreground") {
		throw new Error("Next palette relation policy APCA relation roles are invalid")
	}
	const numericKeys = expectedKeys.filter((key) => key !== "version" && key !== "requiredApcaRelations")
	for (const key of numericKeys) {
		const value = requested[key as keyof NextPaletteRelationPolicy]
		if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
			throw new Error(`Next palette relation policy ${key} must be finite and non-negative`)
		}
	}
	if (!Number.isInteger(requested.maximumDistinctRoleColors) || requested.maximumDistinctRoleColors < 1 ||
		requested.maximumDistinctRoleColors > 4) {
		throw new Error("Next palette relation policy maximumDistinctRoleColors must be within [1, 4]")
	}
	return deepFreeze({
		...requested,
		requiredApcaRelations: {
			foreground: assertRequiredFields(relationRecord.foreground, "foreground"),
			accent: assertRequiredFields(relationRecord.accent, "accent"),
		},
	})
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

function backgroundSupport(node: PaletteRelationNode, maximumPopulation: number): number {
	return mean([
		node.background,
		node.spatial.field,
		node.familySpatial.field,
		Math.sqrt(node.population / Math.max(maximumPopulation, epsilon)),
	])
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
		Math.max(node.spatial.detail, node.familySpatial.detail),
		Math.sqrt(node.population / Math.max(maximumPopulation, epsilon)),
	])
}

function familyCoverage(colors: readonly SolverColor[], mode: NextPaletteRelationRuntime["familyCoverage"]): number {
	const seen = new Set<number>()
	if (mode === "role-local-overlay-evidence") return 1
	if (mode === "union-of-family-masks") {
		let union: Uint8Array | undefined
		for (const color of colors) {
			if (color.generated || seen.has(color.familyId)) continue
			seen.add(color.familyId)
			const mask = color.node.family.mask
			if (!union) union = new Uint8Array(mask.length)
			if (mask.length !== union.length) throw new Error("Selected source family masks have inconsistent domains")
			for (let pixel = 0; pixel < union.length; pixel++) union[pixel] |= mask[pixel]
		}
		return union ? union.reduce((sum, value) => sum + value, 0) / union.length : 0
	}
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
	state: NextPaletteRelationState,
): string {
	return [background.stableKey, foreground.stableKey, surface.stableKey, accent.stableKey, state].join("|")
}

function stateComplexity(state: NextPaletteRelationState): number {
	return state === "collapsed" ? 0 : state === "distinct-flat" ? 1 : 2
}

function isBetter(candidate: Selection, current: Selection | undefined): boolean {
	if (!current) return true
	if (candidate.maximumDeficit < current.maximumDeficit - epsilon) return true
	if (candidate.maximumDeficit > current.maximumDeficit + epsilon) return false
	if (candidate.totalDeficit < current.totalDeficit - epsilon) return true
	if (candidate.totalDeficit > current.totalDeficit + epsilon) return false
	if (stateComplexity(candidate.fieldState) !== stateComplexity(current.fieldState)) {
		return stateComplexity(candidate.fieldState) < stateComplexity(current.fieldState)
	}
	return compareAscii(candidate.stableKey, current.stableKey) < 0
}

function roleColor(color: SolverColor, sourceNodes: readonly PaletteRelationNode[]): RoleColor {
	return {
		rgb: color.rgb,
		hex: color.hex,
		generated: color.generated,
		sourceDistance: color.generated
			? sourceNodes.reduce((nearest, node) => Math.min(nearest, okDistance(color.lab, node.lab)), Infinity)
			: 0,
	}
}

function paletteMetrics(
	selection: Selection,
	sourceNodes: readonly PaletteRelationNode[],
	runtime: NextPaletteRelationRuntime,
): PaletteMetrics {
	const colors = [selection.background, selection.foreground, selection.surface, selection.accent]
	const reconstructionNodes = runtime.reconstructionPopulation === "field-source-partition"
		? sourceNodes.filter((node) => "fieldRoleAllowed" in node && node.fieldRoleAllowed)
		: sourceNodes
	const totalPopulation = reconstructionNodes.reduce((sum, node) => sum + node.population, 0)
	const reconstruction = reconstructionNodes.reduce((sum, node) =>
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
	const relation = selection.fieldEdge?.fieldRelation
	if (!relation) return { isGradient: false, confidence: 1, coverage: 0, continuity: 0, coherence: 0 }
	const support = selection.fieldState === "gradient"
		? relation.stateSupport.gradient
		: relation.stateSupport.distinctFlat
	return {
		isGradient: selection.fieldState === "gradient",
		confidence: support,
		coverage: relation.endpoint.absolutePairCoverage,
		continuity: relation.distribution.continuity,
		coherence: relation.topology.monotoneConnectivity,
	}
}

function toPalette(
	selection: Selection,
	sourceNodes: readonly PaletteRelationNode[],
	runtime: NextPaletteRelationRuntime,
): Palette {
	return {
		background: roleColor(selection.background, sourceNodes),
		foreground: roleColor(selection.foreground, sourceNodes),
		surface: roleColor(selection.surface, sourceNodes),
		accent: roleColor(selection.accent, sourceNodes),
		gradient: gradientEvidence(selection),
		score: clamp01(1 - selection.maximumDeficit),
		metrics: paletteMetrics(selection, sourceNodes, runtime),
	}
}

function increment(rejections: NextPaletteRelationRejections, reason: keyof NextPaletteRelationRejections): false {
	rejections[reason]++
	return false
}

export function solveNextPaletteRelationRuntime(
	graph: PaletteRelationGraph,
	requestedPolicy: NextPaletteRelationPolicy,
	runtime: NextPaletteRelationRuntime,
): NextPaletteRelationResult {
	if (graph.version !== runtime.graphVersion) {
		throw new Error(`Unexpected palette relation graph version: ${String(graph.version)}`)
	}
	if (graph.perceptionVersion !== runtime.perceptionVersion) {
		throw new Error(`Unexpected palette perception version: ${String(graph.perceptionVersion)}`)
	}
	const policy = assertPolicy(requestedPolicy)
	const nodes = [...graph.nodes].sort((first, second) => compareAscii(first.stableKey, second.stableKey))
	const nodeIds = new Set(nodes.map((node) => node.id))
	if (nodeIds.size !== nodes.length) throw new Error("Cannot infer a relation palette from duplicate node IDs")
	const fieldIdSet = new Set(graph.fieldNodeIds)
	const fieldNodes = nodes.filter((node) => fieldIdSet.has(node.id))
	if (fieldNodes.length !== graph.fieldNodeIds.length || fieldNodes.some((node) => !node.fieldEligibility.eligible)) {
		throw new Error("Palette relation graph field membership is inconsistent")
	}
	const edges = new Map(graph.edges.map((edge) => [`${edge.fromId}>${edge.toId}`, edge]))
	const edge = (from: PaletteRelationNode, to: PaletteRelationNode): PaletteRelationEdge => {
		const value = edges.get(`${from.id}>${to.id}`)
		if (!value) throw new Error(`Missing directed palette relation edge ${from.id}>${to.id}`)
		return value
	}
	const contrastLc = (overlay: SolverColor, field: SourceColor): number =>
		overlay.generated || overlay.id === field.id
			? apcaContrast(overlay.rgb, field.rgb)
			: edge(overlay.node, field.node).apcaLc
	const relationPasses = (
		role: NextPaletteRelationOverlayRole,
		overlay: SolverColor,
		background: SourceColor,
		surface: SourceColor,
	): boolean => {
		const fields = { background, surface }
		const positive = role === "foreground"
			? policy.foregroundDarkOnLightMinimumLc : policy.accentDarkOnLightMinimumLc
		const negative = role === "foreground"
			? policy.foregroundLightOnDarkMinimumMagnitudeLc : policy.accentLightOnDarkMinimumMagnitudeLc
		return policy.requiredApcaRelations[role].every((fieldRole) =>
			passesSignedApca(contrastLc(overlay, fields[fieldRole]), positive, negative))
	}
	const sourceColors = nodes.map(sourceColor)
	const passingSourceForegrounds = (background: SourceColor, surface: SourceColor): SourceColor[] =>
		sourceColors.filter((candidate) => relationPasses("foreground", candidate, background, surface))
	const generated = [
		generatedColor("generated-black", [0, 0, 0]),
		generatedColor("generated-white", [255, 255, 255]),
	] as const
	const maximumPopulation = Math.max(...nodes.map((node) => node.population))
	const maximumChroma = Math.max(...nodes.map((node) => node.chroma))
	const rejections: NextPaletteRelationRejections = {
		flatFieldDistance: 0,
		gradientEndpointDistance: 0,
		foregroundApca: 0,
		foregroundFallbackApca: 0,
		accentApca: 0,
		accentDistance: 0,
		roleMembership: 0,
		sourceProvenance: 0,
		stateLegality: 0,
		cardinality: 0,
	}
	const counts = {
		fieldPairs: fieldNodes.length ** 2,
		fieldPairsWithPassingSourceForeground: 0,
		fieldPairsWithGeneratedForegroundAuthorization: 0,
		completeDomain: 0,
		attempted: 0,
		feasible: 0,
	}
	let best: Selection | undefined

	for (const backgroundNode of fieldNodes) {
		const background = sourceColor(backgroundNode)
		for (const surfaceNode of fieldNodes) {
			const surface = sourceColor(surfaceNode)
			const collapsed = background.id === surface.id
			const states: NextPaletteRelationState[] = collapsed
				? ["collapsed"]
				: ["distinct-flat", "gradient"]
			const passingForegrounds = passingSourceForegrounds(background, surface)
			const fallbackAuthorized = passingForegrounds.length === 0
			if (fallbackAuthorized) counts.fieldPairsWithGeneratedForegroundAuthorization++
			else counts.fieldPairsWithPassingSourceForeground++
			const foregrounds: SolverColor[] = fallbackAuthorized ? [...sourceColors, ...generated] : sourceColors
			for (const foreground of foregrounds) {
				const accents: SolverColor[] = foreground.generated ? [foreground, ...sourceColors] : sourceColors
				for (const accent of accents) {
					for (const fieldState of states) {
						counts.completeDomain++
						counts.attempted++
						if (!fieldIdSet.has(background.id) || !fieldIdSet.has(surface.id)) {
							increment(rejections, "roleMembership")
							continue
						}
						const fieldEdge = collapsed ? undefined : edge(backgroundNode, surfaceNode)
						if (collapsed !== (fieldState === "collapsed")) {
							increment(rejections, "stateLegality")
							continue
						}
						if (fieldState === "distinct-flat" && fieldEdge!.distance < policy.flatFieldMinimumDistance) {
							increment(rejections, "flatFieldDistance")
							continue
						}
						if (fieldState === "gradient" && fieldEdge!.distance <= epsilon) {
							increment(rejections, "gradientEndpointDistance")
							continue
						}
						if ((!foreground.generated && foreground.node.candidate.generated) ||
							foreground.generated && !fallbackAuthorized) {
							increment(rejections, "sourceProvenance")
							continue
						}
						if ((!accent.generated && accent.node.candidate.generated) ||
							accent.generated && accent.stableKey !== foreground.stableKey) {
							increment(rejections, "sourceProvenance")
							continue
						}
						if (!relationPasses("foreground", foreground, background, surface)) {
							increment(rejections, foreground.generated ? "foregroundFallbackApca" : "foregroundApca")
							continue
						}
						if (!relationPasses("accent", accent, background, surface)) {
							increment(rejections, "accentApca")
							continue
						}
						if (okDistance(accent.lab, background.lab) < policy.distinctAccentFieldMinimumDistance ||
							okDistance(accent.lab, surface.lab) < policy.distinctAccentFieldMinimumDistance) {
							increment(rejections, "accentDistance")
							continue
						}
						if (distinctColorCount([background, foreground, surface, accent]) > policy.maximumDistinctRoleColors) {
							increment(rejections, "cardinality")
							continue
						}
						counts.feasible++
						if (fieldEdge && !fieldEdge.fieldRelation) throw new Error("Distinct fields lack relation evidence")

						const strongestDistinctRelation = fieldState === "collapsed"
							? fieldNodes.reduce((strongest, alternativeNode) => {
								if (alternativeNode.id === background.id) return strongest
								const alternative = sourceColor(alternativeNode)
								if (foreground.generated && passingSourceForegrounds(background, alternative).length > 0 ||
									!relationPasses("foreground", foreground, background, alternative) ||
									!relationPasses("accent", accent, background, alternative) ||
									okDistance(accent.lab, alternative.lab) < policy.distinctAccentFieldMinimumDistance ||
									distinctColorCount([background, foreground, alternative, accent]) >
										policy.maximumDistinctRoleColors) return strongest
								const alternativeEdge = edge(backgroundNode, alternativeNode)
								if (!alternativeEdge.fieldRelation) return strongest
								const flat = alternativeEdge.distance >= policy.flatFieldMinimumDistance
									? alternativeEdge.fieldRelation.stateSupport.distinctFlat : 0
								const gradient = alternativeEdge.distance > epsilon
									? alternativeEdge.fieldRelation.stateSupport.gradient : 0
								return Math.max(strongest, flat, gradient)
							}, 0)
							: 0
						const accentCollapsed = rgbKey(accent.rgb) === rgbKey(foreground.rgb)
						const strongestDistinctAccent = accentCollapsed
							? nodes.reduce((strongest, node) => {
								const alternative = sourceColor(node)
								if (rgbKey(alternative.rgb) === rgbKey(foreground.rgb) ||
									!relationPasses("accent", alternative, background, surface) ||
									okDistance(alternative.lab, background.lab) < policy.distinctAccentFieldMinimumDistance ||
									okDistance(alternative.lab, surface.lab) < policy.distinctAccentFieldMinimumDistance ||
									distinctColorCount([background, foreground, surface, alternative]) >
										policy.maximumDistinctRoleColors) return strongest
								return Math.max(strongest, accentIdentitySupport(alternative, maximumPopulation, maximumChroma))
							}, 0)
							: 0
						const relationSupport = fieldState === "collapsed"
							? 1 - strongestDistinctRelation
							: fieldState === "gradient"
								? fieldEdge!.fieldRelation!.stateSupport.gradient
								: fieldEdge!.fieldRelation!.stateSupport.distinctFlat
						const objectives: NextPaletteRelationObjectiveVector = [
							backgroundSupport(backgroundNode, maximumPopulation),
							foregroundSupport(foreground, maximumPopulation),
							relationSupport,
							accentCollapsed
								? 1 - strongestDistinctAccent
								: accentIdentitySupport(accent, maximumPopulation, maximumChroma),
							familyCoverage([background, foreground, surface, accent], runtime.familyCoverage),
						]
						const deficits = objectives.map((objective) => 1 - clamp01(objective))
						const selection: Selection = {
							background,
							foreground,
							surface,
							accent,
							fieldState,
							objectives,
							maximumDeficit: Math.max(...deficits),
							totalDeficit: deficits.reduce((sum, deficit) => sum + deficit, 0),
							stableKey: selectionKey(background, foreground, surface, accent, fieldState),
							fieldEdge,
						}
						if (isBetter(selection, best)) best = selection
					}
				}
		}
	}
	}
	if (!best) throw new Error("No complete palette satisfies the relation policy")

	const selectedPassingSourceForegrounds = passingSourceForegrounds(best.background, best.surface)
	const apcaLc = {
		foregroundOnBackground: contrastLc(best.foreground, best.background),
		foregroundOnSurface: contrastLc(best.foreground, best.surface),
		accentOnBackground: contrastLc(best.accent, best.background),
		accentOnSurface: contrastLc(best.accent, best.surface),
	}
	const required = (role: NextPaletteRelationOverlayRole, field: NextPaletteRelationFieldRole) =>
		(policy.requiredApcaRelations[role] as readonly NextPaletteRelationFieldRole[]).includes(field)
	const foregroundPass = (lc: number) => passesSignedApca(
		lc, policy.foregroundDarkOnLightMinimumLc, policy.foregroundLightOnDarkMinimumMagnitudeLc,
	)
	const accentPass = (lc: number) => passesSignedApca(
		lc, policy.accentDarkOnLightMinimumLc, policy.accentLightOnDarkMinimumMagnitudeLc,
	)
	const certificate: NextPaletteRelationCertificate = {
		schemaVersion: 2,
		algorithmVersion: runtime.algorithmVersion,
		identity: runtime.identity,
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
			fieldState: best.fieldState,
			objectives: best.objectives,
			maximumDeficit: best.maximumDeficit,
			totalDeficit: best.totalDeficit,
			stableKey: best.stableKey,
			apcaLc,
			apcaConstraints: {
				foregroundOnBackground: { required: required("foreground", "background"), passesThreshold: foregroundPass(apcaLc.foregroundOnBackground) },
				foregroundOnSurface: { required: required("foreground", "surface"), passesThreshold: foregroundPass(apcaLc.foregroundOnSurface) },
				accentOnBackground: { required: required("accent", "background"), passesThreshold: accentPass(apcaLc.accentOnBackground) },
				accentOnSurface: { required: required("accent", "surface"), passesThreshold: accentPass(apcaLc.accentOnSurface) },
			},
			generatedColorAuthorization: {
				foregroundFallback: {
					authorized: selectedPassingSourceForegrounds.length === 0,
					passingSourceCandidateIds: selectedPassingSourceForegrounds.map((color) => color.id).sort((a, b) => a - b),
				},
				accentCollapse: {
					authorized: best.foreground.generated,
					candidateId: best.foreground.generated ? best.foreground.id : null,
				},
			},
			fieldEdge: best.fieldEdge,
		},
		invariants: {
			completeTupleEnumeration: true,
			signedApcaHardConstraints: true,
			explicitConsumerApcaRelations: true,
			undeclaredApcaRelationsDiagnosticOnly: true,
			relationScopedGeneratedFallback: true,
			explicitSurfaceCollapse: true,
			explicitAccentCollapse: true,
			jointFieldState: true,
			stateSpecificFieldRelation: true,
			noPostselectionMutation: true,
		},
	}
	return deepFreeze({ palette: toPalette(best, nodes, runtime), certificate })
}

export function solveNextPaletteRelation(
	graph: PaletteRelationGraph,
	requestedPolicy: NextPaletteRelationPolicy = NEXT_PALETTE_RELATION_DEVELOPMENT_POLICY,
): NextPaletteRelationResult {
	return solveNextPaletteRelationRuntime(graph, requestedPolicy, NEXT_PALETTE_RELATION_RUNTIME)
}

export function extractNextPaletteRelationWithContext(
	image: RawImage,
	policy: NextPaletteRelationPolicy = NEXT_PALETTE_RELATION_DEVELOPMENT_POLICY,
): NextPaletteRelationContext {
	const perception = perceivePaletteImage(image)
	const graph = buildPaletteRelationGraph(perception)
	return deepFreeze({ ...solveNextPaletteRelation(graph, policy), perception, graph })
}

export function extractNextPaletteRelation(
	image: RawImage,
	policy: NextPaletteRelationPolicy = NEXT_PALETTE_RELATION_DEVELOPMENT_POLICY,
): NextPaletteRelationResult {
	const { palette, certificate } = extractNextPaletteRelationWithContext(image, policy)
	return deepFreeze({ palette, certificate })
}
