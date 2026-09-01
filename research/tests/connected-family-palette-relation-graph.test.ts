import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { perceivePaletteImageWithConnectedFamilies } from "../src/connected-family-palette-perception.ts"
import { loadImage } from "../src/image.ts"
import {
	buildConnectedFamilyPaletteRelationGraph,
	CONNECTED_FAMILY_PALETTE_RELATION_GRAPH_VERSION,
} from "../src/palette-relation-graph.ts"

const projectRoot = fileURLToPath(new URL("../..", import.meta.url))
const goldTypography = "00/ab67616d0000b27300001b7dc13511d828fe5536.jpg"

test("connected source families remain complete overlay nodes but cannot enter field topology", async () => {
	const image = await loadImage(await readFile(`${projectRoot}/${goldTypography}`))
	const perception = perceivePaletteImageWithConnectedFamilies(image)
	const graph = buildConnectedFamilyPaletteRelationGraph(perception)
	const reserves = graph.nodes.filter((node) => node.construction === "connected-family-reserve")
	const fieldIds = new Set(graph.fieldNodeIds)

	assert.equal(graph.version, CONNECTED_FAMILY_PALETTE_RELATION_GRAPH_VERSION)
	assert.ok(reserves.length > 0)
	assert.ok(reserves.every((node) => !node.fieldRoleAllowed && !node.fieldEligibility.eligible && !fieldIds.has(node.id)))
	assert.equal(graph.edges.length, graph.nodes.length * (graph.nodes.length - 1))
	assert.equal(graph.edges.filter((edge) => edge.fieldRelation).length, fieldIds.size * (fieldIds.size - 1))
	assert.ok(graph.edges.some((edge) => reserves.some((node) => node.id === edge.fromId || node.id === edge.toId)))
	assert.equal(new Set(graph.nodes.map((node) => node.stableKey)).size, graph.nodes.length)
})
