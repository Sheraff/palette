import { clampRelationEvidence } from "./field-relation.ts"
import type {
	NativeFieldFamilyNode,
	NativeFieldFamilyQuery,
	NativeFieldHypothesis,
	NativeFieldHypothesisGraph,
} from "./native-field-hypothesis-graph.ts"
import type { RGB } from "./types.ts"

export const FACTORIZED_FIELD_STATE_VERSION = "factorized-field-state-authority-0.1.0-development" as const
export const FACTORIZED_FIELD_STATE_L2 = 0.05
export const FACTORIZED_FIELD_STATE_MAXIMUM_ITERATIONS = 100_000
export const FACTORIZED_FIELD_STATE_GRADIENT_TOLERANCE = 1e-9

export const FIELD_PAIR_FEATURES = Object.freeze([
	"twoFieldFit",
	"incrementalSurfaceIdentity",
	"backgroundFieldSupport",
	"surfaceFieldSupport",
	"pairMass",
	"pairBalance",
	"endpointDistance",
	"overlayComplementarity",
] as const)

export const FIELD_MULTIPLICITY_FEATURES = Object.freeze([
	"oneFieldFit",
	"twoFieldFit",
	"incrementalSurfaceIdentity",
	"backgroundFieldSupport",
	"surfaceFieldSupport",
	"explainedFieldMass",
	"endpointDistinguishability",
	"overlayComplementarity",
] as const)

export type FactorizedComparison = {
	id: string
	groupId: string
	preferred: number[]
	other: number[]
}

export type FactorizedRanker = {
	featureNames: readonly string[]
	means: number[]
	scales: number[]
	coefficients: number[]
	iterations: number
	converged: boolean
	gradientNorm: number
	objective: number
	weightedLogLoss: number
	l2Penalty: number
}

export type FactorizedPrediction = {
	id: string
	groupId: string
	margin: number
	correct: boolean
	logLoss: number
}

export type QueriedFieldPalette = {
	background: { rgb: RGB; generated: boolean }
	surface: { rgb: RGB; generated: boolean }
	gradient: boolean
}

export type QueriedFieldMapping = {
	status: "mapped"
	backgroundFamilyStableKey: string
	surfaceFamilyStableKey: string | null
	hypothesis: NativeFieldHypothesis
} | {
	status: "generated-color" | "missing-query" | "ambiguous" | "unmappable" | "missing-hypothesis"
}

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function mean(values: readonly number[]): number {
	if (values.length === 0) throw new Error("Cannot average an empty value set")
	return values.reduce((sum, value) => sum + value, 0) / values.length
}

function finiteVector(values: readonly number[], length: number, label: string): number[] {
	if (values.length !== length) throw new Error(`${label} must contain ${length} features`)
	return values.map((value, index) => {
		if (!Number.isFinite(value)) throw new Error(`${label}[${index}] must be finite`)
		return value
	})
}

function fieldSupport(family: NativeFieldFamilyNode): number {
	return mean(family.profiles.map((profile) => profile.evidence.spatial.field))
}

function maximumOverlaySupport(hypotheses: readonly NativeFieldHypothesis[]): number {
	return Math.max(0, ...hypotheses.flatMap((hypothesis) => hypothesis.overlayComplements.map((entry) => entry.support)))
}

function relationFor(
	graph: NativeFieldHypothesisGraph,
	backgroundFamilyStableKey: string,
	surfaceFamilyStableKey: string,
) {
	const relation = graph.relations.find((entry) => entry.backgroundFamilyStableKey === backgroundFamilyStableKey &&
		entry.surfaceFamilyStableKey === surfaceFamilyStableKey)
	if (!relation) throw new Error("Ordered field relation is missing")
	return relation
}

export function fieldPairIdentity(hypothesis: NativeFieldHypothesis): string | null {
	return hypothesis.state === "collapsed" ? null :
		`${hypothesis.backgroundFamilyStableKey}>${hypothesis.surfaceFamilyStableKey}`
}

export function fieldPairFeatures(
	graph: NativeFieldHypothesisGraph,
	backgroundFamilyStableKey: string,
	surfaceFamilyStableKey: string,
): number[] {
	const families = new Map(graph.families.map((family) => [family.stableKey, family]))
	const background = families.get(backgroundFamilyStableKey)
	const surface = families.get(surfaceFamilyStableKey)
	if (!background || !surface) throw new Error("Ordered field pair references a missing family")
	const relation = relationFor(graph, backgroundFamilyStableKey, surfaceFamilyStableKey)
	const aliases = graph.hypotheses.filter((hypothesis) => hypothesis.state !== "collapsed" &&
		hypothesis.backgroundFamilyStableKey === backgroundFamilyStableKey &&
		hypothesis.surfaceFamilyStableKey === surfaceFamilyStableKey)
	if (aliases.length !== 2) throw new Error("Ordered field pair must have flat and gradient aliases")
	return finiteVector([
		relation.scale.twoFieldFit.mean,
		relation.scale.incrementalSurfaceIdentity.mean,
		fieldSupport(background),
		fieldSupport(surface),
		mean(relation.profiles.map((profile) => profile.oneTwoField.pairMass)),
		mean(relation.profiles.map((profile) => profile.oneTwoField.balance)),
		clampRelationEvidence(relation.endpointDistance / 0.18),
		maximumOverlaySupport(aliases),
	], FIELD_PAIR_FEATURES.length, "Field-pair features")
}

export function fieldMultiplicityFeatures(
	graph: NativeFieldHypothesisGraph,
	hypothesis: NativeFieldHypothesis,
): number[] {
	const families = new Map(graph.families.map((family) => [family.stableKey, family]))
	const background = families.get(hypothesis.backgroundFamilyStableKey)
	if (!background) throw new Error("Field hypothesis references a missing background family")
	if (hypothesis.state === "collapsed") {
		return finiteVector([
			hypothesis.oneFieldFit.mean,
			0,
			0,
			fieldSupport(background),
			0,
			mean(background.profiles.map((profile) => profile.evidence.population)),
			0,
			maximumOverlaySupport([hypothesis]),
		], FIELD_MULTIPLICITY_FEATURES.length, "Collapsed multiplicity features")
	}
	const surface = families.get(hypothesis.surfaceFamilyStableKey!)
	if (!surface) throw new Error("Field hypothesis references a missing surface family")
	const relation = relationFor(graph, hypothesis.backgroundFamilyStableKey, hypothesis.surfaceFamilyStableKey!)
	const aliases = graph.hypotheses.filter((entry) => entry.state !== "collapsed" &&
		entry.backgroundFamilyStableKey === hypothesis.backgroundFamilyStableKey &&
		entry.surfaceFamilyStableKey === hypothesis.surfaceFamilyStableKey)
	return finiteVector([
		hypothesis.oneFieldFit.mean,
		relation.scale.twoFieldFit.mean,
		relation.scale.incrementalSurfaceIdentity.mean,
		fieldSupport(background),
		fieldSupport(surface),
		mean(relation.profiles.map((profile) => profile.oneTwoField.pairMass)),
		mean(relation.profiles.map((profile) => profile.oneTwoField.distinguishability)),
		maximumOverlaySupport(aliases),
	], FIELD_MULTIPLICITY_FEATURES.length, "Two-field multiplicity features")
}

function rgbKey(rgb: RGB): string {
	return rgb.join(",")
}

export function mapQueriedFieldPalette(
	graph: NativeFieldHypothesisGraph,
	queries: readonly NativeFieldFamilyQuery[],
	palette: QueriedFieldPalette,
): QueriedFieldMapping {
	if (palette.background.generated || palette.surface.generated) return { status: "generated-color" }
	const byRgb = new Map(queries.map((query) => [rgbKey(query.rgb), query]))
	const background = byRgb.get(rgbKey(palette.background.rgb))
	const surface = byRgb.get(rgbKey(palette.surface.rgb))
	if (!background || !surface) return { status: "missing-query" }
	if (background.status === "ambiguous" || surface.status === "ambiguous") return { status: "ambiguous" }
	if (background.status === "unmappable" || surface.status === "unmappable" ||
		!background.familyStableKey || !surface.familyStableKey) return { status: "unmappable" }
	const collapsed = background.familyStableKey === surface.familyStableKey
	const state = collapsed ? "collapsed" : palette.gradient ? "gradient" : "distinct-flat"
	const hypothesis = graph.hypotheses.find((entry) => entry.state === state &&
		entry.backgroundFamilyStableKey === background.familyStableKey &&
		(collapsed || entry.surfaceFamilyStableKey === surface.familyStableKey))
	if (!hypothesis) return { status: "missing-hypothesis" }
	return {
		status: "mapped",
		backgroundFamilyStableKey: background.familyStableKey,
		surfaceFamilyStableKey: collapsed ? null : surface.familyStableKey,
		hypothesis,
	}
}

function sigmoid(value: number): number {
	if (value >= 0) return 1 / (1 + Math.exp(-value))
	const exponential = Math.exp(value)
	return exponential / (1 + exponential)
}

function softplusNegative(value: number): number {
	return value >= 0 ? Math.log1p(Math.exp(-value)) : -value + Math.log1p(Math.exp(value))
}

function dot(first: readonly number[], second: readonly number[]): number {
	return first.reduce((sum, value, index) => sum + value * second[index], 0)
}

export function fitFactorizedRanker(
	featureNames: readonly string[],
	comparisons: readonly FactorizedComparison[],
): FactorizedRanker {
	if (featureNames.length === 0 || comparisons.length === 0) throw new Error("Factorized fitting requires features and comparisons")
	const ids = new Set<string>()
	for (const comparison of comparisons) {
		if (!comparison.id || !comparison.groupId) throw new Error("Factorized comparisons require IDs and source groups")
		if (ids.has(comparison.id)) throw new Error(`Duplicate factorized comparison: ${comparison.id}`)
		ids.add(comparison.id)
		finiteVector(comparison.preferred, featureNames.length, `${comparison.id}.preferred`)
		finiteVector(comparison.other, featureNames.length, `${comparison.id}.other`)
	}
	const endpoints = comparisons.flatMap((comparison) => [comparison.preferred, comparison.other])
	const means = featureNames.map((_, feature) => mean(endpoints.map((entry) => entry[feature])))
	const scales = featureNames.map((_, feature) => Math.max(Math.sqrt(mean(endpoints.map((entry) =>
		(entry[feature] - means[feature]) ** 2))), 1e-12))
	const byGroup = new Map<string, number>()
	for (const comparison of comparisons) byGroup.set(comparison.groupId, (byGroup.get(comparison.groupId) ?? 0) + 1)
	const rows = comparisons.map((comparison) => ({
		difference: comparison.preferred.map((value, feature) => (value - comparison.other[feature]) / scales[feature]),
		weight: 1 / byGroup.size / byGroup.get(comparison.groupId)!,
	}))
	const hessianBound = FACTORIZED_FIELD_STATE_L2 + rows.reduce((sum, row) =>
		sum + 0.25 * row.weight * dot(row.difference, row.difference), 0)
	const step = 1 / hessianBound
	const coefficients = featureNames.map(() => 0)
	let gradientNorm = Infinity
	let iterations = 0
	for (; iterations < FACTORIZED_FIELD_STATE_MAXIMUM_ITERATIONS; iterations++) {
		const gradient = coefficients.map((coefficient) => FACTORIZED_FIELD_STATE_L2 * coefficient)
		for (const row of rows) {
			const multiplier = -row.weight * sigmoid(-dot(coefficients, row.difference))
			for (let feature = 0; feature < gradient.length; feature++) {
				gradient[feature] += multiplier * row.difference[feature]
			}
		}
		gradientNorm = Math.sqrt(dot(gradient, gradient))
		if (gradientNorm <= FACTORIZED_FIELD_STATE_GRADIENT_TOLERANCE) break
		for (let feature = 0; feature < coefficients.length; feature++) coefficients[feature] -= step * gradient[feature]
	}
	const weightedLogLoss = rows.reduce((sum, row) =>
		sum + row.weight * softplusNegative(dot(coefficients, row.difference)), 0)
	const l2Penalty = FACTORIZED_FIELD_STATE_L2 / 2 * dot(coefficients, coefficients)
	return {
		featureNames: [...featureNames], means, scales, coefficients, iterations,
		converged: gradientNorm <= FACTORIZED_FIELD_STATE_GRADIENT_TOLERANCE,
		gradientNorm,
		objective: weightedLogLoss + l2Penalty,
		weightedLogLoss,
		l2Penalty,
	}
}

export function scoreFactorizedFeatures(ranker: FactorizedRanker, features: readonly number[]): number {
	const values = finiteVector(features, ranker.featureNames.length, "Factorized score")
	return dot(ranker.coefficients, values.map((value, feature) =>
		(value - ranker.means[feature]) / ranker.scales[feature]))
}

export function leaveOneFactorizedSourceGroupOut(
	featureNames: readonly string[],
	comparisons: readonly FactorizedComparison[],
): FactorizedPrediction[] {
	const groups = [...new Set(comparisons.map((comparison) => comparison.groupId))].sort(compareAscii)
	if (groups.length < 2) throw new Error("Factorized grouped evaluation requires at least two source groups")
	const predictions: FactorizedPrediction[] = []
	for (const groupId of groups) {
		const ranker = fitFactorizedRanker(featureNames, comparisons.filter((entry) => entry.groupId !== groupId))
		for (const comparison of comparisons.filter((entry) => entry.groupId === groupId)) {
			const margin = scoreFactorizedFeatures(ranker, comparison.preferred) -
				scoreFactorizedFeatures(ranker, comparison.other)
			predictions.push({ id: comparison.id, groupId, margin, correct: margin > 0, logLoss: softplusNegative(margin) })
		}
	}
	return predictions.sort((first, second) => compareAscii(first.groupId, second.groupId) || compareAscii(first.id, second.id))
}
