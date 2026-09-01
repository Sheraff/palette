import assert from "node:assert/strict"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { loadImage } from "../src/image.ts"
import { traceUiAccentContrast } from "../src/ui-accent-contrast-trace.ts"

const projectRoot = fileURLToPath(new URL("../..", import.meta.url))
const source = join(projectRoot, "00/ab67616d0000b2730000c4e4d278f49bbc995440.jpg")

test("UI accent trace finds source-safe alternatives without changing other roles", async () => {
	const image = await loadImage(source)
	const trace = traceUiAccentContrast(image)

	assert.equal(trace.canonical.contrast.pass, false)
	assert.ok(trace.canonical.contrast.background < 3)
	assert.ok(trace.canonical.contrast.surface < 3)
	assert.ok(trace.bestSafeAlternative)
	assert.ok(trace.safeAlternatives.every((alternative) => alternative.contrast.background >= 3))
	assert.ok(trace.safeAlternatives.every((alternative) => alternative.contrast.surface >= 3))
	assert.ok(trace.safeAlternatives.every((alternative) => alternative.hardFeasible))
	assert.equal(trace.invariants.backgroundFrozen, true)
	assert.equal(trace.invariants.foregroundFrozen, true)
	assert.equal(trace.invariants.surfaceFrozen, true)
	assert.equal(trace.invariants.gradientFrozen, true)
})

test("UI accent trace is deterministic", async () => {
	const image = await loadImage(source)
	assert.deepEqual(traceUiAccentContrast(image), traceUiAccentContrast(image))
})
