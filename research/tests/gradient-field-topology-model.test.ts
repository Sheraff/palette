import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { fileURLToPath } from "node:url"
import type { GradientFieldTopologyEvidence } from "../src/gradient-field-topology.ts"
import {
	decideGradientFieldTopologyScore,
	GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY,
	scoreGradientFieldTopologyEvidence,
} from "../src/gradient-field-topology-model.ts"

const developmentPath = fileURLToPath(new URL(
	"../data/experiments/gradient-field-topology-3.0.0-development.json", import.meta.url,
))
const fitPath = fileURLToPath(new URL(
	"../data/experiments/gradient-field-topology-3.0.0-fit.json", import.meta.url,
))

type DevelopmentArtifact = {
	entries: Array<{ familyId: string; evidence: GradientFieldTopologyEvidence }>
}

type FitArtifact = {
	model: unknown
}

const artifacts = Promise.all([
	readFile(developmentPath, "utf8").then((source) => JSON.parse(source) as DevelopmentArtifact),
	readFile(fitPath, "utf8").then((source) => JSON.parse(source) as FitArtifact),
])

test("frozen scorer identity exactly matches the selected v3 fit model", async () => {
	const [, fit] = await artifacts
	assert.deepEqual(GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY, {
		modelVersion: "gradient-field-topology-model-3.0.0-dev",
		variant: "unified-owned-continuity",
		evidenceVersion: "gradient-field-topology-evidence-3.0.0-dev",
		featureNames: ["unifiedOwnedContinuity", "ownedProgression", "ownedConnectivity"],
		featureFormulas: [
			"1 - (1 - sqrt(features.distributionContinuity * ownership.surfaceRoleOwnership)) * (1 - sqrt(features.distributionContinuity * ownership.spatialFieldOwnership))",
			"features.fieldOwnership * max(progression.linearFit, progression.nonlinearFit)",
			"features.fieldOwnership * topology.rootedConnectivity",
		],
		featureTransforms: ["identity", "identity", "identity"],
		intercept: -0.03878414572829437,
		coefficients: [2.0957691140229535, 0.5506220479091976, 0],
		featureMeans: [0.5745412789598641, 0.2564454338897794, 0.21306668557921601],
		featureScales: [0.22765616962247104, 0.2006111505833459, 0.1637037677760149],
		rawEquivalentIntercept: -6.031798096253494,
		rawEquivalentCoefficients: [9.205852481390815, 2.74472304409837, 0],
		threshold: 0.25629320384844717,
		trainingArtifactSha256: "2722e5a99b8b218b3d28c975f5ae00624862420acae790da71f2cadfa3ec1983",
		fittingConfigSha256: "ea380df441f2473b2ad2ee18db7954cf10844019af95c6e74f968a008d559dc4",
		parameterSha256: "98d0a0d89e83d1e66a211c05557db74467f13bf4cb1d99766a650f29178fbc11",
	})
	assert.deepEqual(GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY, fit.model)
	assert.ok(Object.isFrozen(GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY))
	for (const values of [
		GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.featureNames,
		GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.featureFormulas,
		GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.featureTransforms,
		GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.coefficients,
		GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.featureMeans,
		GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.featureScales,
		GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.rawEquivalentCoefficients,
	]) assert.ok(Object.isFrozen(values))
})

test("scorer reproduces exact v3 formulas and standardized fit score for a development entry", async () => {
	const [development, fitArtifact] = await artifacts
	const entry = development.entries[0]
	assert.equal(entry.familyId, "gc-01fb7ae1535fee775cef")
	const evidence = entry.evidence
	const model = fitArtifact.model as typeof GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY
	const surfaceOwnedContinuity = Math.sqrt(
		evidence.features.distributionContinuity * evidence.ownership.surfaceRoleOwnership,
	)
	const spatialOwnedContinuity = Math.sqrt(
		evidence.features.distributionContinuity * evidence.ownership.spatialFieldOwnership,
	)
	const expectedFeatures = {
		unifiedOwnedContinuity: 1 - (1 - surfaceOwnedContinuity) * (1 - spatialOwnedContinuity),
		ownedProgression: evidence.features.fieldOwnership *
			Math.max(evidence.progression.linearFit, evidence.progression.nonlinearFit),
		ownedConnectivity: evidence.features.fieldOwnership * evidence.topology.rootedConnectivity,
	}
	const featureVector = model.featureNames.map((name) => expectedFeatures[name])
	const standardized = featureVector.map((value, index) =>
		(value - model.featureMeans[index]) / model.featureScales[index])
	const expectedLogit = model.intercept + standardized.reduce((sum, value, index) =>
		sum + value * model.coefficients[index], 0)
	const expectedScore = expectedLogit >= 0
		? 1 / (1 + Math.exp(-expectedLogit))
		: Math.exp(expectedLogit) / (1 + Math.exp(expectedLogit))
	const decision = scoreGradientFieldTopologyEvidence(evidence)
	assert.deepEqual(decision.features, expectedFeatures)
	assert.equal(decision.logit, expectedLogit)
	assert.equal(decision.score, expectedScore)
	assert.equal(decision.threshold, model.threshold)
	assert.equal(decision.margin, expectedScore - model.threshold)
	assert.equal(decision.eligible, expectedScore >= model.threshold)
	assert.equal(decision.modelIdentity, GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY)
})

test("threshold decision is inclusive and validates discrimination scores", () => {
	const threshold = GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.threshold
	assert.equal(decideGradientFieldTopologyScore(threshold), true)
	assert.equal(decideGradientFieldTopologyScore(threshold - Number.EPSILON), false)
	assert.throws(() => decideGradientFieldTopologyScore(Number.NaN), /finite and within \[0, 1\]/)
	assert.throws(() => decideGradientFieldTopologyScore(1.01), /finite and within \[0, 1\]/)
})

test("scorer rejects stale evidence and every malformed consumed value", async () => {
	const [development] = await artifacts
	type MutableEvidence = {
		evidenceVersion: string
		features: Record<string, number>
		ownership: Record<string, number>
		progression: Record<string, number>
		topology: Record<string, number>
	}
	const source = development.entries[0].evidence
	const stale = structuredClone(source) as unknown as MutableEvidence
	stale.evidenceVersion = "gradient-field-topology-evidence-stale"
	assert.throws(
		() => scoreGradientFieldTopologyEvidence(stale as unknown as GradientFieldTopologyEvidence),
		/Unexpected gradient-field-topology evidence version/,
	)
	for (const [scope, field] of [
		["features", "distributionContinuity"],
		["features", "fieldOwnership"],
		["ownership", "surfaceRoleOwnership"],
		["ownership", "spatialFieldOwnership"],
		["progression", "linearFit"],
		["progression", "nonlinearFit"],
		["topology", "rootedConnectivity"],
	] as const) {
		const malformed = structuredClone(source) as unknown as MutableEvidence
		malformed[scope][field] = 1.01
		assert.throws(
			() => scoreGradientFieldTopologyEvidence(malformed as unknown as GradientFieldTopologyEvidence),
			/finite and within \[0, 1\]/,
			`${scope}.${field}`,
		)
	}
	const nonfinite = structuredClone(source) as unknown as MutableEvidence
	nonfinite.features.distributionContinuity = Number.POSITIVE_INFINITY
	assert.throws(
		() => scoreGradientFieldTopologyEvidence(nonfinite as unknown as GradientFieldTopologyEvidence),
		/finite and within \[0, 1\]/,
	)
})
