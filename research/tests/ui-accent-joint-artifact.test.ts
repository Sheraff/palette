import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("checked-in UI accent joint POC satisfies the complete technical contract", async () => {
	const evaluation = JSON.parse(await readFile(new URL(
		"../data/experiments/ui-accent-joint-0.1.0-poc.1-development/evaluation.json",
		import.meta.url,
	), "utf8"))

	assert.equal(evaluation.decision, "configured-poc-passes-technical-contract-broad-review-required")
	assert.ok(Object.values(evaluation.stopConditions).every((value) => value === false))
	assert.deepEqual(evaluation.profile, { backgroundMinimum: 3, surfaceMinimum: 3 })
	assert.deepEqual({
		entries: evaluation.developmentSummary.entries,
		failures: evaluation.developmentSummary.failures,
		changed: evaluation.developmentSummary.exactChanged,
		violations: evaluation.developmentSummary.contractViolations,
		safeChanged: evaluation.developmentSummary.safeIncumbentsChanged,
	}, { entries: 37, failures: 0, changed: 20, violations: 0, safeChanged: 0 })
	assert.deepEqual({
		entries: evaluation.canonical00Summary.entries,
		failures: evaluation.canonical00Summary.failures,
		changed: evaluation.canonical00Summary.exactChanged,
		violations: evaluation.canonical00Summary.contractViolations,
		safeChanged: evaluation.canonical00Summary.safeIncumbentsChanged,
		acceptedChanged: evaluation.canonical00Summary.byReviewClass.accepted.changed,
	}, { entries: 355, failures: 0, changed: 147, violations: 0, safeChanged: 0, acceptedChanged: 47 })
})
