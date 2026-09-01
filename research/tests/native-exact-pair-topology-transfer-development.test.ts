import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"

const projectRoot = resolve(import.meta.dirname, "../..")
const developmentPath = resolve(projectRoot, "research/data/native-exact-pair-topology-transfer-development.json")
const analysisPath = resolve(projectRoot, "research/data/native-exact-pair-topology-transfer-analysis.json")

test("checked native exact-pair topology transfer evidence preserves its narrow authority", async () => {
	const [developmentSource, analysisSource] = await Promise.all([
		readFile(developmentPath),
		readFile(analysisPath),
	])
	assert.equal(createHash("sha256").update(developmentSource).digest("hex"),
		"cf7eede975536aa0fa50645d63c1f8c5158f19c971c3e81a09fe1dc730307d30")
	assert.equal(createHash("sha256").update(analysisSource).digest("hex"),
		"17c31c78ae172b638e10171f598a10250bdcc89403f0b703546cf37ba177c4ca")
	const development = JSON.parse(developmentSource.toString("utf8"))
	const analysis = JSON.parse(analysisSource.toString("utf8"))
	assert.equal(analysis.developmentSha256,
		"cf7eede975536aa0fa50645d63c1f8c5158f19c971c3e81a09fe1dc730307d30")
	assert.equal(development.inventory.decisiveRows, 274)
	assert.equal(development.inventory.sourceIneligible.length, 4)
	assert.equal(analysis.reproducibility.mismatchCount, 2)
	assert.equal(analysis.reproducibility.deterministic, true)
	assert.deepEqual(analysis.reproducibility.mismatches.map((entry: any) => entry.file), [
		"horrorwood.jpg",
		"meteora.jpg",
	])
	assert.equal(analysis.summary.overall.mapped, 250)
	assert.equal(analysis.summary.overall.coverage, 0.9124087591240876)
	assert.equal(analysis.summary.overall.native.accuracy, 0.848)
	assert.equal(analysis.summary.overall.native.balancedAccuracy, 0.8541559444158517)
	assert.equal(analysis.summary.overall.native.meanLogLoss, 0.32343211579898407)
	assert.equal(analysis.summary.overall.transferDelta.decisionAgreement, 0.996)
	assert.ok(Object.values(analysis.gates).every(Boolean))
	assert.equal(analysis.decision.status, "pass")
	assert.equal(analysis.decision.nativeExactPairTopologyTransfer, true)
	assert.equal(analysis.decision.futureStructuredFieldStatePlanAuthorized, true)
	assert.equal(analysis.decision.completeTuplePlanAuthorized, false)
	assert.equal(analysis.decision.paletteOutputAuthorized, false)
	assert.equal(analysis.decision.humanReviewAuthorized, false)
	assert.equal(analysis.decision.reserveRootsAuthorized, false)
})
