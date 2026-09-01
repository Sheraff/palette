import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	canonicalJson,
	sha256,
} from "../src/album-artwork-palette-v2-0.7.4-candidate-review.ts"
import { ALBUM_ARTWORK_PALETTE_V2_VERSION } from "../src/album-artwork-palette-v2-protocol.ts"

const researchRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

async function readJson(path: string): Promise<any> {
	return JSON.parse(await readFile(resolve(researchRoot, path), "utf8"))
}

test("0.7.5 freezes exact known-bad evidence before counterfactual output", async () => {
	const roster = await readJson("data/album-artwork-palette-v2-0.7.5-known-bad-roster.json")
	const { rosterId, ...withoutId } = roster
	assert.equal(rosterId, sha256(canonicalJson(withoutId)))
	assert.equal(rosterId, "0ce0465834d82b1a72e931eab21e5a4b318eac14919c4bb07b59e5e7e5653c6f")
	assert.equal(roster.status, "frozen-before-counterfactual-0.7.5-output")
	assert.deepEqual(roster.counts, {
		caseCount: 7,
		phase4BlockerCount: 2,
		systemicDiagnosticCount: 3,
		acceptedIsolatedLimitationCount: 2,
	})
	assert.deepEqual(roster.cases.filter((entry: any) => entry.blocksPhase4).map((entry: any) => entry.caseId),
		["development-03", "development-12"])
	for (const entry of roster.cases) {
		for (const evidence of entry.humanEvidence) {
			assert.equal(evidence.sourceSha256, entry.current074.source.sha256)
			assert.equal(evidence.treatmentKey, entry.current074.winnerKey)
		}
	}
})

test("0.7.5 closes as a diagnostic audit when no repeated severe class is proven", async () => {
	const audit = await readJson("data/album-artwork-palette-v2-0.7.5-known-failure-audit.json")
	const { analysisId, ...withoutId } = audit
	assert.equal(analysisId, sha256(canonicalJson(withoutId)))
	assert.equal(analysisId, "1fb095ab8d331694eaf09ab5405532961ca3e4845142ddc92b14f88bc5f54ae1")
	assert.equal(audit.status, "closed-diagnostic-audit-no-counterfactual-candidate-output")
	assert.equal(audit.mechanismSelection.selectedFailureClass, null)
	assert.equal(audit.mechanismSelection.selectedMechanism, null)
	assert.equal(audit.mechanismSelection.repeatedSevereFailureClassSupported, false)
	assert.equal(audit.mechanismSelection.disposition, "end-0.7.5-as-diagnostic-audit")
	assert.equal(audit.nextBoundedDiagnosticReview.status, "predeclared-not-authorized")
	assert.equal(audit.nextBoundedDiagnosticReview.maximumItemCount, 1)
	assert.equal(audit.authorization.candidateImplementation, false)
	assert.equal(audit.authorization.humanReview, false)
})

test("0.7.5 preparation leaves the default extractor version unchanged", () => {
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_VERSION, "album-artwork-first-principles-0.7.2")
})
