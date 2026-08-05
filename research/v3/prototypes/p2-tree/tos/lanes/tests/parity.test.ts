/**
 * **The anti-drift test.** `lanes/` restates two blocks of `../../pipeline.ts` — the retained-node
 * construction (`nodes.ts`) and the same-colour clustering (`pool.ts`) — because this worker does not
 * own `pipeline.ts` and the merge is a later, sequenced change.
 *
 * Duplicated code is a defect waiting for a rounding difference, and duplicated code in a palette
 * algorithm fails *silently*: every node still has a colour, every palette still validates. So the
 * duplication is not defended by inspection. It is pinned:
 *
 *  1. `laneRetainedNodes` run on the L tree must reproduce `parseTree(image, tree).nodes` field for
 *     field, for every synthetic cover;
 *  2. the **field** roles, the verdict, the ground chain and the coverage must be untouched by the
 *     chromatic lanes — a ground stack is a reading of lightness structure, and a chroma tree makes
 *     no statement about it. This is the invariant D2 did *not* relax;
 *  3. the L lane's node block must still be the merged parse's prefix, node for node, so every id in
 *     the round-1 artefacts still names the node it named;
 *  4. both identity pools must be **supersets** of the L-only parse's. D2 lets the lanes reorder the
 *     foreground — that is the whole point of grafting them into the text detector — but a colour the
 *     L-only parse offered and the merged parse does not is a candidate lost, not gained.
 *
 * (4) is asserted on these synthetic fixtures, whose component populations are far below
 * `TEXT_COMPONENT_LIMIT`. On a busy cover the shared area-ordered cut *can* drop an L component in
 * favour of a larger chromatic one; that is a cost guard binding, not a rule, and `integration-NOTES.md`
 * records it.
 *
 * If a future edit changes the rules on either side, one of these fails.
 */

import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { rgbToHex } from "../../../../../src/contract/color.ts"
import type { Rgb8 } from "../../../../../src/contract/types.ts"
import { decodeImage, parseTree } from "../../pipeline.ts"
import { quantiseLanes } from "../channels.ts"
import { buildLane, laneRetainedNodes } from "../nodes.ts"
import { runChromaPipeline } from "../pool.ts"
import { writeColorFixtures } from "./fixtures.ts"

const hexes = (colors: readonly Rgb8[]): string[] => colors.map(rgbToHex)

test("laneRetainedNodes reproduces parseTree's nodes on the L tree", async () => {
	const directory = await mkdtemp(join(tmpdir(), "p2-lanes-parity-nodes-"))
	try {
		for (const path of await writeColorFixtures(directory)) {
			const image = await decodeImage(path)
			const [lChannel] = quantiseLanes(image)
			const built = buildLane(image, lChannel)
			const parsed = parseTree(image, built.tree)
			const mirrored = laneRetainedNodes(image, built.tree, "L")

			assert.equal(mirrored.length, parsed.nodes.length, `${path}: retained node count`)
			for (let index = 0; index < parsed.nodes.length; index += 1) {
				const expected = parsed.nodes[index]
				const actual = mirrored[index]
				// Everything but `thinness`, which `parseTree` fills in for its own top marks and
				// `laneRetainedNodes` leaves for whoever needs it.
				assert.deepEqual(
					{
						id: actual.id,
						parent: actual.parent,
						treeNodeId: actual.treeNodeId,
						depth: actual.depth,
						level: actual.level,
						areaFraction: actual.areaFraction,
						ownAreaFraction: actual.ownAreaFraction,
						centroidX: actual.centroidX,
						centroidY: actual.centroidY,
						growth: actual.growth,
						repr: actual.repr,
						kind: actual.kind,
					},
					{
						id: expected.id,
						parent: expected.parent,
						treeNodeId: expected.treeNodeId,
						depth: expected.depth,
						level: expected.level,
						areaFraction: expected.areaFraction,
						ownAreaFraction: expected.ownAreaFraction,
						centroidX: expected.centroidX,
						centroidY: expected.centroidY,
						growth: expected.growth,
						repr: expected.repr,
						kind: expected.kind,
					},
					`${path}: node ${index}`,
				)
			}
		}
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
})

test("the lanes leave the field alone, keep the L block, and only add identity candidates", async () => {
	const directory = await mkdtemp(join(tmpdir(), "p2-lanes-parity-pools-"))
	try {
		for (const path of await writeColorFixtures(directory)) {
			const image = await decodeImage(path)
			const [lChannel] = quantiseLanes(image)
			const built = buildLane(image, lChannel)
			const base = parseTree(image, built.tree)
			const result = await runChromaPipeline(path)

			assert.deepEqual(
				result.lanes.map((lane) => lane.lane),
				["L", "a", "b"],
				`${path}: lanes must be built in LANES order`,
			)
			for (const lane of result.lanes) {
				for (const node of lane.nodes) assert.equal(node.lane, lane.lane, `${path}: every node records its lane`)
			}

			// The field is the L lane's, before and after.
			assert.equal(result.parse.verdict, base.verdict, `${path}: verdict`)
			assert.deepEqual(result.parse.groundChain, base.groundChain, `${path}: ground chain`)
			assert.equal(result.parse.coverage, base.coverage, `${path}: coverage`)
			assert.equal(result.parse.laminarity, base.laminarity, `${path}: laminarity`)
			assert.equal(result.parse.gradient, base.gradient, `${path}: gradient`)
			assert.equal(rgbToHex(result.parse.roles.background), rgbToHex(base.roles.background), `${path}: background`)
			assert.equal(rgbToHex(result.parse.roles.surface), rgbToHex(base.roles.surface), `${path}: surface`)

			// The L lane's nodes are the merged parse's prefix, id for id.
			assert.ok(result.parse.nodes.length > base.nodes.length, `${path}: the lanes must add nodes`)
			for (let index = 0; index < base.nodes.length; index += 1) {
				assert.equal(result.parse.nodes[index].id, base.nodes[index].id, `${path}: node ${index} id`)
				assert.equal(result.parse.nodes[index].parent, base.nodes[index].parent, `${path}: node ${index} parent`)
				assert.deepEqual(result.parse.nodes[index].repr, base.nodes[index].repr, `${path}: node ${index} repr`)
			}
			// Every extra node is a lane node whose parent is a real node of the merged tree.
			for (const node of result.parse.nodes) {
				assert.ok(node.parent === -1 || node.parent < node.id, `${path}: node ${node.id} parent ${node.parent}`)
			}

			for (const color of hexes(base.foregroundPool)) {
				assert.ok(hexes(result.parse.foregroundPool).includes(color), `${path}: ${color} dropped from the foreground pool`)
			}
			for (const color of hexes(base.accentPool)) {
				assert.ok(hexes(result.parse.accentPool).includes(color), `${path}: ${color} dropped from the accent pool`)
			}
		}
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
})
