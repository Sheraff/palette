import type { GradientFieldTopologyEvidence } from "./gradient-field-topology.ts"

export const GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY = Object.freeze({
	modelVersion: "gradient-field-topology-model-3.0.0-dev",
	variant: "unified-owned-continuity",
	evidenceVersion: "gradient-field-topology-evidence-3.0.0-dev",
	featureNames: Object.freeze([
		"unifiedOwnedContinuity",
		"ownedProgression",
		"ownedConnectivity",
	] as const),
	featureFormulas: Object.freeze([
		"1 - (1 - sqrt(features.distributionContinuity * ownership.surfaceRoleOwnership)) * (1 - sqrt(features.distributionContinuity * ownership.spatialFieldOwnership))",
		"features.fieldOwnership * max(progression.linearFit, progression.nonlinearFit)",
		"features.fieldOwnership * topology.rootedConnectivity",
	] as const),
	featureTransforms: Object.freeze(["identity", "identity", "identity"] as const),
	intercept: -0.03878414572829437,
	coefficients: Object.freeze([2.0957691140229535, 0.5506220479091976, 0] as const),
	featureMeans: Object.freeze([0.5745412789598641, 0.2564454338897794, 0.21306668557921601] as const),
	featureScales: Object.freeze([0.22765616962247104, 0.2006111505833459, 0.1637037677760149] as const),
	rawEquivalentIntercept: -6.031798096253494,
	rawEquivalentCoefficients: Object.freeze([9.205852481390815, 2.74472304409837, 0] as const),
	threshold: 0.25629320384844717,
	trainingArtifactSha256: "2722e5a99b8b218b3d28c975f5ae00624862420acae790da71f2cadfa3ec1983",
	fittingConfigSha256: "ea380df441f2473b2ad2ee18db7954cf10844019af95c6e74f968a008d559dc4",
	parameterSha256: "98d0a0d89e83d1e66a211c05557db74467f13bf4cb1d99766a650f29178fbc11",
} as const)

export type GradientFieldTopologyModelIdentity = typeof GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY

export type GradientFieldTopologyModelFeatures = {
	unifiedOwnedContinuity: number
	ownedProgression: number
	ownedConnectivity: number
}

export type GradientFieldTopologyModelDecision = {
	features: GradientFieldTopologyModelFeatures
	logit: number
	/** Balanced-prior discrimination score; not a calibrated probability. */
	score: number
	threshold: number
	margin: number
	eligible: boolean
	modelIdentity: GradientFieldTopologyModelIdentity
}

function record(value: unknown, label: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be an object`)
	}
	return value as Record<string, unknown>
}

function finiteUnit(value: unknown, label: string): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
		throw new Error(`${label} must be finite and within [0, 1]`)
	}
	return value
}

function sigmoid(value: number): number {
	if (value >= 0) return 1 / (1 + Math.exp(-value))
	const exponential = Math.exp(value)
	return exponential / (1 + exponential)
}

export function decideGradientFieldTopologyScore(score: number): boolean {
	return finiteUnit(score, "Gradient-field-topology discrimination score") >=
		GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.threshold
}

export function scoreGradientFieldTopologyEvidence(
	evidence: GradientFieldTopologyEvidence,
): GradientFieldTopologyModelDecision {
	const root = record(evidence, "Gradient-field-topology evidence")
	if (root.evidenceVersion !== GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.evidenceVersion) {
		throw new Error(`Unexpected gradient-field-topology evidence version: ${String(root.evidenceVersion)}`)
	}
	const evidenceFeatures = record(root.features, "Gradient-field-topology evidence.features")
	const ownership = record(root.ownership, "Gradient-field-topology evidence.ownership")
	const progression = record(root.progression, "Gradient-field-topology evidence.progression")
	const topology = record(root.topology, "Gradient-field-topology evidence.topology")
	const distributionContinuity = finiteUnit(
		evidenceFeatures.distributionContinuity, "Gradient-field-topology evidence.features.distributionContinuity",
	)
	const fieldOwnership = finiteUnit(
		evidenceFeatures.fieldOwnership, "Gradient-field-topology evidence.features.fieldOwnership",
	)
	const surfaceRoleOwnership = finiteUnit(
		ownership.surfaceRoleOwnership, "Gradient-field-topology evidence.ownership.surfaceRoleOwnership",
	)
	const spatialFieldOwnership = finiteUnit(
		ownership.spatialFieldOwnership, "Gradient-field-topology evidence.ownership.spatialFieldOwnership",
	)
	const linearFit = finiteUnit(
		progression.linearFit, "Gradient-field-topology evidence.progression.linearFit",
	)
	const nonlinearFit = finiteUnit(
		progression.nonlinearFit, "Gradient-field-topology evidence.progression.nonlinearFit",
	)
	const rootedConnectivity = finiteUnit(
		topology.rootedConnectivity, "Gradient-field-topology evidence.topology.rootedConnectivity",
	)

	const surfaceOwnedContinuity = Math.sqrt(distributionContinuity * surfaceRoleOwnership)
	const spatialOwnedContinuity = Math.sqrt(distributionContinuity * spatialFieldOwnership)
	const features: GradientFieldTopologyModelFeatures = {
		unifiedOwnedContinuity: 1 - (1 - surfaceOwnedContinuity) * (1 - spatialOwnedContinuity),
		ownedProgression: fieldOwnership * Math.max(linearFit, nonlinearFit),
		ownedConnectivity: fieldOwnership * rootedConnectivity,
	}
	const featureVector = GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.featureNames.map((name) => features[name])
	const standardized = featureVector.map((value, index) =>
		(value - GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.featureMeans[index]) /
		GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.featureScales[index])
	const logit = GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.intercept + standardized.reduce((sum, value, index) =>
		sum + value * GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.coefficients[index], 0)
	const score = sigmoid(logit)
	const threshold = GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.threshold
	return {
		features,
		logit,
		score,
		threshold,
		margin: score - threshold,
		eligible: decideGradientFieldTopologyScore(score),
		modelIdentity: GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY,
	}
}
