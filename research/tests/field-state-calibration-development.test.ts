import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"

const projectRoot = resolve(import.meta.dirname, "../..")
const developmentPath = resolve(projectRoot, "research/data/field-state-calibration-development.json")
const analysisPath = resolve(projectRoot, "research/data/field-state-calibration-analysis.json")

test("checked field-state calibration evidence preserves the failed diagnostic gate", async () => {
	const [developmentSource, analysisSource] = await Promise.all([
		readFile(developmentPath),
		readFile(analysisPath),
	])
	assert.equal(createHash("sha256").update(developmentSource).digest("hex"),
		"01aa9d550f1fb46079d282a5986bb58a79bba78fa96e2329cb20d11daee557df")
	assert.equal(createHash("sha256").update(analysisSource).digest("hex"),
		"dde20ef99f3991c687bfd21ab8b65d2651e6f26ca273886b04089280f79e967e")
	const analysis = JSON.parse(analysisSource.toString("utf8"))
	assert.equal(analysis.developmentSha256,
		"01aa9d550f1fb46079d282a5986bb58a79bba78fa96e2329cb20d11daee557df")
	assert.equal(analysis.dataset.trainingComparisons, 48)
	assert.equal(analysis.dataset.trainingSourceGroups.length, 21)
	assert.equal(analysis.dataset.diagnosticSourceGroupsExcluded.length, 5)
	assert.equal(analysis.groupedEvaluation.sourceGroupBalancedAccuracy, 0.7658730158730158)
	assert.equal(analysis.groupedEvaluation.sourceGroupBalancedBaselineAccuracy, 0.6309523809523809)
	assert.equal(analysis.groupedEvaluation.comparisonAccuracy, 35 / 48)
	assert.equal(analysis.groupedEvaluation.comparisonBaselineAccuracy, 26 / 48)
	assert.equal(analysis.gates.oncePreserved, true)
	assert.equal(analysis.gates.kraftyPreserved, false)
	assert.equal(analysis.gates.maroon5Improved, true)
	assert.equal(analysis.gates.knucklesImproved, true)
	assert.equal(analysis.gates.birdsofpreyImproved, true)
	assert.equal(analysis.decision.status, "withhold")
	assert.equal(analysis.decision.fieldRankingAuthority, false)
	assert.equal(analysis.decision.paletteOutputAuthorized, false)
	assert.equal(analysis.decision.humanReviewAuthorized, false)
	assert.equal(analysis.decision.reserveRootsAuthorized, false)
})
