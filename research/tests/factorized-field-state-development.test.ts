import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"

const projectRoot = resolve(import.meta.dirname, "../..")
const developmentPath = resolve(projectRoot, "research/data/factorized-field-state-development.json")
const analysisPath = resolve(projectRoot, "research/data/factorized-field-state-analysis.json")

test("checked factorized field-state evidence preserves every failed authority gate", async () => {
	const [developmentSource, analysisSource] = await Promise.all([
		readFile(developmentPath),
		readFile(analysisPath),
	])
	assert.equal(createHash("sha256").update(developmentSource).digest("hex"),
		"1e1d52d0cd967e5033660bfaf7a87af140bb026a5cd75620a5513ee3d9ec42b0")
	assert.equal(createHash("sha256").update(analysisSource).digest("hex"),
		"c5f4e95522474208c2a30fced72b5648897088adf88e88f52218b100a5064ee2")
	const development = JSON.parse(developmentSource.toString("utf8"))
	const analysis = JSON.parse(analysisSource.toString("utf8"))
	assert.equal(analysis.developmentSha256,
		"1e1d52d0cd967e5033660bfaf7a87af140bb026a5cd75620a5513ee3d9ec42b0")
	assert.equal(analysis.directMultiplicityDataset.rawJudgments, 21)
	assert.equal(analysis.directMultiplicityDataset.rawSourceGroups, 19)
	assert.equal(analysis.directMultiplicityDataset.mappedJudgments, 17)
	assert.equal(analysis.directMultiplicityDataset.trainingJudgments, 15)
	assert.equal(analysis.directMultiplicityDataset.trainingSourceGroups, 14)
	assert.equal(analysis.pairEvaluation.sourceBalancedAccuracy, 0.5757575757575758)
	assert.equal(analysis.multiplicityEvaluation.sourceBalancedAccuracy, 0.5)
	assert.equal(analysis.multiplicityEvaluation.baselineAccuracy, 0.6428571428571429)
	assert.deepEqual(development.resources.frozenGraphReproductionMismatches, [
		"26ab93c9c2e806f79e9930f060d39597b1f9ef9811aa19e7ee048903d7e7cb7f",
	])
	assert.deepEqual(development.resources.queryMutationMismatches, [])
	assert.equal(analysis.gates.familyQueriesPreserveGraphDomain, true)
	assert.equal(analysis.gates.pairAccuracy, false)
	assert.equal(analysis.gates.multiplicityAccuracy, false)
	assert.equal(analysis.gates.multiplicityLogLoss, false)
	assert.equal(analysis.gates.multiplicityImprovesBaseline, false)
	assert.equal(analysis.gates.structuredGradientChecks, false)
	assert.equal(analysis.gates.kraftyRegressionPrevented, true)
	assert.equal(analysis.decision.status, "withhold")
	assert.equal(analysis.decision.factorizedFieldAuthority, false)
	assert.equal(analysis.decision.completeTuplePlanAuthorized, false)
	assert.equal(analysis.decision.paletteOutputAuthorized, false)
	assert.equal(analysis.decision.humanReviewAuthorized, false)
	assert.equal(analysis.decision.reserveRootsAuthorized, false)
})
