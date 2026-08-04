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
 *  2. the foreground pool must pass through **untouched** — the lanes reach the accent this cycle and
 *     nothing else, and a foreground that moved would mean this module had quietly taken over a
 *     ranking the sibling worker owns;
 *  3. the accent pool must be a **superset** of `parseTree`'s, in order. Adding candidates ahead of
 *     the ones that were already there is the one intended difference; dropping or reordering one
 *     would mean the shared pool had lost a candidate rather than gained some.
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
import { adoptThinness, mergePools, runChromaPipeline } from "../pool.ts"
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

test("the shared pool passes the foreground through and only grows the accent", async () => {
	const directory = await mkdtemp(join(tmpdir(), "p2-lanes-parity-pools-"))
	try {
		for (const path of await writeColorFixtures(directory)) {
			const image = await decodeImage(path)
			const [lChannel] = quantiseLanes(image)
			const built = buildLane(image, lChannel)
			const base = parseTree(image, built.tree)
			adoptThinness(base, built)
			const restricted = mergePools(image, [built], base)

			assert.deepEqual(
				hexes(restricted.parse.foregroundPool),
				hexes(base.foregroundPool),
				`${path}: the foreground pool is the sibling's ranking and must pass through untouched`,
			)
			assert.equal(
				rgbToHex(restricted.parse.roles.foreground),
				rgbToHex(base.roles.foreground),
				`${path}: the foreground itself must be unchanged`,
			)

			// The accent pool may grow, and only by prefixing: every colour the L-only parse offered is
			// still offered, in the same relative order.
			const merged = hexes(restricted.parse.accentPool)
			const original = hexes(base.accentPool)
			let cursor = -1
			for (const color of original) {
				const position = merged.indexOf(color)
				assert.ok(position > cursor, `${path}: ${color} is missing from, or reordered in, the accent pool`)
				cursor = position
			}
		}
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
})

test("the three-lane pools are supersets of the L-only pools, and the lanes are recorded", async () => {
	const directory = await mkdtemp(join(tmpdir(), "p2-lanes-parity-three-"))
	try {
		for (const path of await writeColorFixtures(directory)) {
			const result = await runChromaPipeline(path)
			assert.deepEqual(
				result.lanes.map((lane) => lane.lane),
				["L", "a", "b"],
				`${path}: lanes must be built in LANES order`,
			)
			for (const lane of result.lanes) {
				for (const node of lane.nodes) assert.equal(node.lane, lane.lane, `${path}: every node records its lane`)
			}
			for (const color of hexes(result.base.accentPool)) {
				assert.ok(hexes(result.parse.accentPool).includes(color), `${path}: ${color} dropped from the accent pool`)
			}
			assert.deepEqual(
				hexes(result.parse.foregroundPool),
				hexes(result.base.foregroundPool),
				`${path}: the foreground pool must pass through untouched`,
			)
			// Field roles are the L lane's and are not this cycle's business.
			assert.equal(rgbToHex(result.parse.roles.background), rgbToHex(result.base.roles.background), `${path}: background`)
			assert.equal(rgbToHex(result.parse.roles.surface), rgbToHex(result.base.roles.surface), `${path}: surface`)
		}
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
})
