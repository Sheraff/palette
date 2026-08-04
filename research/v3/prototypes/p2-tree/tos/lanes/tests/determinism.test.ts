/**
 * **The double-run test, for three lanes.**
 *
 * The determinism rule is not "there is no `Math.random()`" — it is that every tie is broken on a
 * quantity computed from pixel values or raster coordinates, and that nothing is ordered by a hash,
 * by a map's iteration order, by a filename or by content. Three lanes add three new places to get
 * that wrong: the lane order itself, the cross-lane tie-breaks in both rankings, and the two `Map`s
 * `channels.ts` uses to tabulate levels per distinct colour. Running everything twice in one process
 * catches the crude half of that, which is the half a prototype gets wrong.
 *
 * The fixtures are written here rather than taken from the corpus, so the test says the same thing in
 * a worktree with no artwork shards checked out.
 */

import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { colorFromRgb } from "../../../../../src/contract/color.ts"
import { validatePalette } from "../../../../../src/contract/invariants.ts"
import { decodeImage, unpack } from "../../pipeline.ts"
import { paletteOf } from "../../candidate-chroma.ts"
import { nodesOf } from "../dump.ts"
import { runChromaPipeline } from "../pool.ts"
import { writeColorFixtures } from "./fixtures.ts"

test("two runs of the chromatic candidate agree byte for byte", async () => {
	const directory = await mkdtemp(join(tmpdir(), "p2-lanes-determinism-"))
	try {
		for (const path of await writeColorFixtures(directory)) {
			assert.equal(JSON.stringify(await paletteOf(path)), JSON.stringify(await paletteOf(path)), `${path}: palette`)
			assert.equal(JSON.stringify(await nodesOf(path)), JSON.stringify(await nodesOf(path)), `${path}: node dump`)
		}
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
})

test("every published colour is an exact triple of the source, and every palette validates", async () => {
	const directory = await mkdtemp(join(tmpdir(), "p2-lanes-exactness-"))
	try {
		for (const path of await writeColorFixtures(directory)) {
			const image = await decodeImage(path)
			const present = new Set<string>()
			for (const packed of image.packed) present.add(colorFromRgb(unpack(packed)).hex)

			const palette = await paletteOf(path)
			for (const [role, color] of Object.entries(palette.roles)) {
				assert.ok(present.has(color.hex), `${path}: ${role} ${color.hex} is not a colour the artwork contains`)
			}
			for (const stop of palette.gradient?.stops ?? []) {
				assert.ok(present.has(stop.color.hex), `${path}: gradient stop ${stop.color.hex} is not in the artwork`)
			}
			assert.deepEqual(validatePalette(palette).violations, [], `${path}: contract violations`)
		}
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
})

test("the node dump is sorted by id, lane-tagged, and internally consistent", async () => {
	const directory = await mkdtemp(join(tmpdir(), "p2-lanes-dump-"))
	try {
		for (const path of await writeColorFixtures(directory)) {
			const dump = await nodesOf(path)
			const result = await runChromaPipeline(path)

			assert.equal(dump.pipeline, "p2-tos-chroma")
			assert.equal(
				dump.nodes.length,
				result.lanes.reduce((sum, lane) => sum + lane.nodes.length, 0),
				`${path}: the dump must hold every retained node of every lane`,
			)
			assert.deepEqual(dump.nodeCountByLane, result.lanes.map((lane) => lane.nodes.length), `${path}: per-lane counts`)

			for (let index = 0; index < dump.nodes.length; index += 1) {
				assert.equal(dump.nodes[index].id, index, `${path}: ids must be the ascending global index`)
				const parent = dump.nodes[index].parent
				if (parent === -1) continue
				assert.ok(parent < index, `${path}: node ${index}'s parent must precede it`)
				assert.equal(dump.nodes[parent].lane, dump.nodes[index].lane, `${path}: a parent must be in the same lane`)
			}
			const lanesSeen = new Set(dump.nodes.map((node) => node.lane))
			assert.deepEqual([...lanesSeen].sort(), ["L", "a", "b"], `${path}: all three lanes must be represented`)
		}
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
})
