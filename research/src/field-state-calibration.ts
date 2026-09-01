import { okDistance, rgbToOKLab } from "./color.ts"
import type {
	NativeFieldFamilyNode,
	NativeFieldHypothesis,
	NativeFieldHypothesisGraph,
} from "./native-field-hypothesis-graph.ts"
import type { RGB } from "./types.ts"

export const FIELD_STATE_CALIBRATION_VERSION = "native-field-composition-calibration-0.1.0-development" as const
export const FIELD_STATE_MAPPING_DISTANCE = 0.025
export const FIELD_STATE_MAPPING_MARGIN = 0.005
export const FIELD_STATE_CALIBRATION_L2 = 0.05
export const FIELD_STATE_CALIBRATION_MAXIMUM_ITERATIONS = 100_000
export const FIELD_STATE_CALIBRATION_GRADIENT_TOLERANCE = 1e-9

export const FIELD_STATE_CALIBRATION_FEATURES = Object.freeze([
	"collapsed",
	"gradient",
	"stateSupport",
	"stateStability",
	"oneFieldFit",
	"twoFieldFit",
	"incrementalSurfaceIdentity",
	"backgroundFieldSupport",
	"surfaceFieldSupport",
	"overlayComplementarity",
] as const)

export type FieldStateCalibrationFeature = typeof FIELD_STATE_CALIBRATION_FEATURES[number]

export type FieldPaletteInput = {
	background: { rgb: RGB; generated: boolean }
	surface: { rgb: RGB; generated: boolean }
	gradient: { isGradient: boolean }
}

export type FieldEndpointMapping = {
	status: "exact-rgb" | "unique-nearest"
	familyStableKey: string
	representativeKey: string
	distance: number
	secondFamilyDistance: number | null
}

export type FieldPaletteMapping = {
	status: "mapped"
	background: FieldEndpointMapping
	surface: FieldEndpointMapping
	hypothesis: NativeFieldHypothesis
	features: number[]
} | {
	status: "generated-color" | "ambiguous" | "unmappable" | "missing-hypothesis"
	role: "background" | "surface" | null
}

export type FieldStatePairwiseComparison = {
	id: string
	groupId: string
	preferred: number[]
	other: number[]
}

export type FieldStateRanker = {
	featureNames: readonly FieldStateCalibrationFeature[]
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

export type FieldStateOutOfGroupPrediction = {
	id: string
	groupId: string
	margin: number
	correct: boolean
	logLoss: number
}

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function finite(value: number, label: string): number {
	if (!Number.isFinite(value)) throw new Error(`${label} must be finite`)
	return value
}

function finiteVector(values: readonly number[], label: string): number[] {
	if (values.length !== FIELD_STATE_CALIBRATION_FEATURES.length) {
		throw new Error(`${label} must contain ${FIELD_STATE_CALIBRATION_FEATURES.length} features`)
	}
	return values.map((value, index) => finite(value, `${label}.${FIELD_STATE_CALIBRATION_FEATURES[index]}`))
}

function mean(values: readonly number[]): number {
	if (values.length === 0) throw new Error("Cannot average an empty value set")
	return values.reduce((sum, value) => sum + value, 0) / values.length
}

function familyFieldSupport(family: NativeFieldFamilyNode): number {
	return mean(family.profiles.map((profile) => profile.evidence.spatial.field))
}

export function fieldStateHypothesisFeatures(
	graph: NativeFieldHypothesisGraph,
	hypothesis: NativeFieldHypothesis,
): number[] {
	const families = new Map(graph.families.map((family) => [family.stableKey, family]))
	const background = families.get(hypothesis.backgroundFamilyStableKey)
	const surface = hypothesis.surfaceFamilyStableKey === null ? null : families.get(hypothesis.surfaceFamilyStableKey)
	if (!background || hypothesis.surfaceFamilyStableKey !== null && !surface) {
		throw new Error(`Hypothesis ${hypothesis.stableKey} references a missing family`)
	}
	const features = [
		hypothesis.state === "collapsed" ? 1 : 0,
		hypothesis.state === "gradient" ? 1 : 0,
		hypothesis.stateSupport.mean,
		1 - hypothesis.stateSupport.range,
		hypothesis.oneFieldFit.mean,
		hypothesis.twoFieldFit?.mean ?? 0,
		hypothesis.incrementalSurfaceIdentity?.mean ?? 0,
		familyFieldSupport(background),
		surface ? familyFieldSupport(surface) : 0,
		Math.max(0, ...hypothesis.overlayComplements.map((entry) => entry.support)),
	]
	return finiteVector(features, `Hypothesis ${hypothesis.stableKey}`)
}

function sameRgb(first: RGB, second: RGB): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function mapEndpoint(
	graph: NativeFieldHypothesisGraph,
	rgb: RGB,
	generated: boolean,
): FieldEndpointMapping | "generated-color" | "ambiguous" | "unmappable" {
	if (generated) return "generated-color"
	const families = graph.families.filter((family) => family.kind === "primary-field")
	const exact = families.flatMap((family) => family.representatives
		.filter((representative) => sameRgb(representative.rgb, rgb))
		.map((representative) => ({ family, representative })))
	const exactFamilies = new Set(exact.map((entry) => entry.family.stableKey))
	if (exactFamilies.size > 1) return "ambiguous"
	if (exact.length > 0) {
		exact.sort((first, second) => compareAscii(first.representative.stableKey, second.representative.stableKey))
		return {
			status: "exact-rgb",
			familyStableKey: exact[0].family.stableKey,
			representativeKey: exact[0].representative.stableKey,
			distance: 0,
			secondFamilyDistance: null,
		}
	}

	const lab = rgbToOKLab(rgb)
	const nearest = families.map((family) => {
		const representatives = family.representatives.map((representative) => ({
			representative,
			distance: okDistance(lab, representative.lab),
		})).sort((first, second) => first.distance - second.distance ||
			compareAscii(first.representative.stableKey, second.representative.stableKey))
		return { family, ...representatives[0] }
	}).sort((first, second) => first.distance - second.distance ||
		compareAscii(first.family.stableKey, second.family.stableKey))
	const best = nearest[0]
	const second = nearest[1]
	if (!best || best.distance > FIELD_STATE_MAPPING_DISTANCE) return "unmappable"
	if (second && second.distance - best.distance <= FIELD_STATE_MAPPING_MARGIN) return "ambiguous"
	return {
		status: "unique-nearest",
		familyStableKey: best.family.stableKey,
		representativeKey: best.representative.stableKey,
		distance: best.distance,
		secondFamilyDistance: second?.distance ?? null,
	}
}

export function mapPaletteToFieldHypothesis(
	graph: NativeFieldHypothesisGraph,
	palette: FieldPaletteInput,
): FieldPaletteMapping {
	const background = mapEndpoint(graph, palette.background.rgb, palette.background.generated)
	if (typeof background === "string") return { status: background, role: "background" }
	const surface = mapEndpoint(graph, palette.surface.rgb, palette.surface.generated)
	if (typeof surface === "string") return { status: surface, role: "surface" }
	const state = background.familyStableKey === surface.familyStableKey
		? "collapsed"
		: palette.gradient.isGradient ? "gradient" : "distinct-flat"
	const hypothesis = graph.hypotheses.find((entry) => entry.state === state &&
		entry.backgroundFamilyStableKey === background.familyStableKey &&
		(state === "collapsed" || entry.surfaceFamilyStableKey === surface.familyStableKey))
	if (!hypothesis) return { status: "missing-hypothesis", role: null }
	return {
		status: "mapped",
		background,
		surface,
		hypothesis,
		features: fieldStateHypothesisFeatures(graph, hypothesis),
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

function scaler(comparisons: readonly FieldStatePairwiseComparison[]) {
	const endpoints = comparisons.flatMap((comparison) => [
		finiteVector(comparison.preferred, `Comparison ${comparison.id}.preferred`),
		finiteVector(comparison.other, `Comparison ${comparison.id}.other`),
	])
	if (endpoints.length === 0) throw new Error("At least one calibration comparison is required")
	const means = FIELD_STATE_CALIBRATION_FEATURES.map((_, feature) => mean(endpoints.map((entry) => entry[feature])))
	const scales = FIELD_STATE_CALIBRATION_FEATURES.map((_, feature) => {
		const variance = mean(endpoints.map((entry) => (entry[feature] - means[feature]) ** 2))
		return Math.max(Math.sqrt(variance), 1e-12)
	})
	return { means, scales }
}

function standardizedDifference(
	comparison: FieldStatePairwiseComparison,
	scales: readonly number[],
): number[] {
	return comparison.preferred.map((value, feature) => (value - comparison.other[feature]) / scales[feature])
}

function dot(first: readonly number[], second: readonly number[]): number {
	return first.reduce((sum, value, index) => sum + value * second[index], 0)
}

export function fitFieldStateRanker(comparisons: readonly FieldStatePairwiseComparison[]): FieldStateRanker {
	if (comparisons.length === 0) throw new Error("At least one decisive comparison is required")
	const ids = new Set<string>()
	for (const comparison of comparisons) {
		if (!comparison.id || !comparison.groupId) throw new Error("Calibration comparisons require IDs and source groups")
		if (ids.has(comparison.id)) throw new Error(`Duplicate calibration comparison: ${comparison.id}`)
		ids.add(comparison.id)
		finiteVector(comparison.preferred, `Comparison ${comparison.id}.preferred`)
		finiteVector(comparison.other, `Comparison ${comparison.id}.other`)
	}
	const { means, scales } = scaler(comparisons)
	const byGroup = new Map<string, number>()
	for (const comparison of comparisons) byGroup.set(comparison.groupId, (byGroup.get(comparison.groupId) ?? 0) + 1)
	const groupCount = byGroup.size
	const rows = comparisons.map((comparison) => ({
		difference: standardizedDifference(comparison, scales),
		weight: 1 / groupCount / byGroup.get(comparison.groupId)!,
	}))
	const hessianBound = FIELD_STATE_CALIBRATION_L2 + rows.reduce((sum, row) =>
		sum + 0.25 * row.weight * dot(row.difference, row.difference), 0)
	const step = 1 / hessianBound
	const coefficients = FIELD_STATE_CALIBRATION_FEATURES.map(() => 0)
	let gradientNorm = Infinity
	let iterations = 0
	for (; iterations < FIELD_STATE_CALIBRATION_MAXIMUM_ITERATIONS; iterations++) {
		const gradient = coefficients.map((coefficient) => FIELD_STATE_CALIBRATION_L2 * coefficient)
		for (const row of rows) {
			const multiplier = -row.weight * sigmoid(-dot(coefficients, row.difference))
			for (let feature = 0; feature < gradient.length; feature++) {
				gradient[feature] += multiplier * row.difference[feature]
			}
		}
		gradientNorm = Math.sqrt(dot(gradient, gradient))
		if (gradientNorm <= FIELD_STATE_CALIBRATION_GRADIENT_TOLERANCE) break
		for (let feature = 0; feature < coefficients.length; feature++) coefficients[feature] -= step * gradient[feature]
	}
	const weightedLogLoss = rows.reduce((sum, row) =>
		sum + row.weight * softplusNegative(dot(coefficients, row.difference)), 0)
	const l2Penalty = FIELD_STATE_CALIBRATION_L2 / 2 * dot(coefficients, coefficients)
	return {
		featureNames: FIELD_STATE_CALIBRATION_FEATURES,
		means,
		scales,
		coefficients,
		iterations,
		converged: gradientNorm <= FIELD_STATE_CALIBRATION_GRADIENT_TOLERANCE,
		gradientNorm,
		objective: weightedLogLoss + l2Penalty,
		weightedLogLoss,
		l2Penalty,
	}
}

export function scoreFieldStateFeatures(ranker: FieldStateRanker, features: readonly number[]): number {
	const values = finiteVector(features, "Scored field-state features")
	return dot(ranker.coefficients, values.map((value, index) => (value - ranker.means[index]) / ranker.scales[index]))
}

export function leaveOneSourceGroupOut(
	comparisons: readonly FieldStatePairwiseComparison[],
): FieldStateOutOfGroupPrediction[] {
	const groups = [...new Set(comparisons.map((comparison) => comparison.groupId))].sort(compareAscii)
	if (groups.length < 2) throw new Error("Grouped calibration requires at least two source groups")
	const predictions: FieldStateOutOfGroupPrediction[] = []
	for (const groupId of groups) {
		const training = comparisons.filter((comparison) => comparison.groupId !== groupId)
		const heldOut = comparisons.filter((comparison) => comparison.groupId === groupId)
		const ranker = fitFieldStateRanker(training)
		for (const comparison of heldOut) {
			const margin = scoreFieldStateFeatures(ranker, comparison.preferred) -
				scoreFieldStateFeatures(ranker, comparison.other)
			predictions.push({
				id: comparison.id,
				groupId,
				margin,
				correct: margin > 0,
				logLoss: softplusNegative(margin),
			})
		}
	}
	return predictions.sort((first, second) => compareAscii(first.groupId, second.groupId) || compareAscii(first.id, second.id))
}

export function rankFieldHypotheses(graph: NativeFieldHypothesisGraph, ranker: FieldStateRanker) {
	return graph.hypotheses.map((hypothesis) => ({
		hypothesis,
		score: scoreFieldStateFeatures(ranker, fieldStateHypothesisFeatures(graph, hypothesis)),
	})).sort((first, second) => second.score - first.score || compareAscii(first.hypothesis.stableKey, second.hypothesis.stableKey))
}
