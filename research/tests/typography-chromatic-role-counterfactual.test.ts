import assert from "node:assert/strict"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { loadImage } from "../src/image.ts"
import { traceTypographyChromaticRoleCounterfactuals } from "../src/typography-chromatic-role-counterfactual.ts"

const projectRoot = fileURLToPath(new URL("../..", import.meta.url))
const targetSource = join(projectRoot, "00/ab67616d0000b2730000c4e4d278f49bbc995440.jpg")

test("typography role counterfactual trace freezes the other three roles", async () => {
	const image = await loadImage(targetSource)
	const trace = traceTypographyChromaticRoleCounterfactuals(image)
	for (const evaluation of Object.values(trace.evaluations)) {
		assert.ok(Object.values(evaluation.otherRolesFrozen).every(Boolean))
	}
	assert.equal(trace.invariants.readOnly, true)
	assert.equal(trace.candidate.anchorDegrees, 0)
})

test("typography role counterfactual trace is deterministic", async () => {
	const image = await loadImage(targetSource)
	assert.deepEqual(
		traceTypographyChromaticRoleCounterfactuals(image),
		traceTypographyChromaticRoleCounterfactuals(image),
	)
})
