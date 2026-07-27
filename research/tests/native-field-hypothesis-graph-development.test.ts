import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"

const projectRoot = resolve(import.meta.dirname, "../..")
const developmentPath = resolve(projectRoot, "research/data/native-field-hypothesis-graph-development.json")
const analysisPath = resolve(projectRoot, "research/data/native-field-hypothesis-graph-analysis.json")

test("checked-in native field graph development evidence is complete and non-authorizing", async () => {
	const [development, analysisSource] = await Promise.all([readFile(developmentPath), readFile(analysisPath)])
	assert.equal(createHash("sha256").update(development).digest("hex"),
		"990b3fb8370cb670831dcd0734b1bfdd1d17f58dd9fd617d3967698cc9fb8281")
	assert.equal(createHash("sha256").update(analysisSource).digest("hex"),
		"469b0547896bab3268a600083aa80b0865091d60df3c02d8f094211534bdde61")
	const analysis = JSON.parse(analysisSource.toString("utf8"))
	assert.equal(analysis.structuralDecision.status, "pass")
	assert.equal(analysis.structuralDecision.paletteOutputProduced, false)
	assert.equal(analysis.scaleEvidence.totalOrderedRelations, 3326)
	assert.equal(analysis.scaleEvidence.disagreementRelations, 250)
	assert.equal(analysis.conclusion.availabilityBottleneck, false)
	assert.equal(analysis.conclusion.currentDiagnosticRankingAuthority, false)
	assert.equal(analysis.conclusion.humanReviewAuthorized, false)
	assert.equal(analysis.conclusion.reserveRootsAuthorized, false)
	assert.equal(analysis.diagnosticCases.once.outcome, "mechanically-separated")
	assert.equal(analysis.diagnosticCases.krafty.outcome, "mechanically-separated")
	assert.equal(analysis.diagnosticCases.maroon5.outcome, "available-but-under-ranked")
	assert.equal(analysis.diagnosticCases.knuckles.outcome, "available-but-under-ranked")
	assert.equal(analysis.diagnosticCases.birdsofprey.outcome, "available-but-relation-evidence-near-zero")
})
