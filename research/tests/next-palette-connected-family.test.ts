import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { loadImage } from "../src/image.ts"
import {
	extractNextPaletteConnectedFamilyWithContext,
	NEXT_PALETTE_CONNECTED_FAMILY_ALGORITHM_VERSION,
	NEXT_PALETTE_CONNECTED_FAMILY_IDENTITY,
} from "../src/next-palette-connected-family.ts"

const projectRoot = fileURLToPath(new URL("../..", import.meta.url))
const goldTypography = "00/ab67616d0000b27300001b7dc13511d828fe5536.jpg"

test("connected family inference remains complete, deterministic, and field constrained", async () => {
	const image = await loadImage(await readFile(`${projectRoot}/${goldTypography}`))
	const first = extractNextPaletteConnectedFamilyWithContext(image)
	const second = extractNextPaletteConnectedFamilyWithContext(image)
	const { certificate, graph, palette } = first
	const rejectionTotal = Object.values(certificate.hardConstraintRejections).reduce((sum, count) => sum + count, 0)
	const selectedIds = new Set(Object.values(certificate.selected.candidateIds).filter((id): id is number => typeof id === "number"))
	const selectedNodes = graph.nodes.filter((node) => selectedIds.has(node.id))

	assert.deepEqual(first, second)
	assert.equal(certificate.algorithmVersion, NEXT_PALETTE_CONNECTED_FAMILY_ALGORITHM_VERSION)
	assert.equal(certificate.identity, NEXT_PALETTE_CONNECTED_FAMILY_IDENTITY)
	assert.equal(certificate.counts.completeDomain, certificate.counts.attempted)
	assert.equal(certificate.counts.feasible + rejectionTotal, certificate.counts.attempted)
	assert.ok(graph.nodes.some((node) => node.construction === "connected-family-reserve"))
	assert.ok(graph.fieldNodeIds.every((id) => graph.nodes.find((node) => node.id === id)?.construction === "lloyd-cluster"))
	assert.ok(selectedNodes.every((node) => !node.candidate.generated))
	assert.equal(palette.score, 1 - certificate.selected.maximumDeficit)
	assert.ok(certificate.selected.objectives.every((objective) => objective >= 0 && objective <= 1))
})
