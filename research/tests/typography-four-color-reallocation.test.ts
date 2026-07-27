import assert from "node:assert/strict"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { loadImage } from "../src/image.ts"
import { traceTypographyFourColorReallocation } from "../src/typography-four-color-reallocation.ts"

const projectRoot = fileURLToPath(new URL("../..", import.meta.url))
const targetSource = join(projectRoot, "00/ab67616d0000b2730000c4e4d278f49bbc995440.jpg")

test("four-color reallocation freezes readable foreground and forces the certified accent", async () => {
	const image = await loadImage(targetSource)
	const trace = traceTypographyFourColorReallocation(image)

	assert.ok(trace.alternatives.length > 0)
	assert.equal(trace.invariants.maximumFourColors, true)
	assert.ok(trace.alternatives.every((alternative) =>
		alternative.roles.foreground === trace.canonical.roles.foreground))
	assert.ok(trace.alternatives.every((alternative) =>
		alternative.roles.accent === trace.forcedCandidate.hex))
	assert.ok(trace.alternatives.every((alternative) => alternative.distinctColorCount <= 4))
})

test("four-color reallocation trace is deterministic", async () => {
	const image = await loadImage(targetSource)
	assert.deepEqual(
		traceTypographyFourColorReallocation(image),
		traceTypographyFourColorReallocation(image),
	)
})
