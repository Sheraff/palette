/**
 * **The brute-force reference for a chromatic tree.**
 *
 * `../../tests/brute-force.test.ts` checks the tree builder against a naive reading of the level-set
 * definition on integer rasters. This file checks the thing that is actually new: that the raster fed
 * to it by the `a` and `b` lanes is the right raster, and that a tree built over it is the same
 * object the definition describes at the chroma lanes' level count.
 *
 * Three claims, each separately falsifiable:
 *
 *  1. **the quantiser is right** — `quantiseLanes` agrees, pixel for pixel, with a direct
 *     `rgbToOkLab` + `chromaLevel` recomputation, and its levels round-trip to within half a step;
 *  2. **the tree over a chromatic raster is right** — the fast tree's shapes and nesting equal
 *     `bruteForceShapes`', on the a lane of every synthetic cover and on random rasters at the chroma
 *     lanes' level count;
 *  3. **the lanes see what L cannot** — on the isoluminant fixture the L tree contains no node
 *     separating the two marks, and the a tree does. That is arm-b′ §2.1's whole claim, as a test.
 */

import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { rgbToOkLab } from "../../../../../src/contract/color.ts"
import { L_LEVEL_STEP } from "../../constants.ts"
import { decodeImage, unpack } from "../../pipeline.ts"
import { buildTreeOfShapes, shapeSupports, type ShapeTree } from "../../tree.ts"
import { bruteForceShapes, isWellComposed, randomWellComposedFixtures } from "../../tests/reference.ts"
import { chromaLevel, quantiseLanes } from "../channels.ts"
import { CHROMA_AXIS_STEPS, CHROMA_LEVEL_COUNT } from "../constants.ts"
import { colorFixtures, isoluminantPair, lightnessLevel, writeColorFixtures } from "./fixtures.ts"

/** The set of distinct shapes a tree produces, keyed the way the reference keys them. */
function treeShapes(tree: ShapeTree): Map<string, number[]> {
	const supports = shapeSupports(tree)
	const shapes = new Map<string, number[]>()
	for (let nodeId = 0; nodeId < tree.nodeCount; nodeId += 1) {
		const pixels = Array.from(supports.pixels.subarray(supports.offsets[nodeId], supports.offsets[nodeId + 1])).sort(
			(first, second) => first - second,
		)
		shapes.set(pixels.join(","), pixels)
	}
	return shapes
}

/** Same shapes, same nesting, as `../../tests/brute-force.test.ts` compares them. */
function compareToDefinition(name: string, levels: Int32Array, width: number, height: number, levelCount: number): void {
	assert.ok(isWellComposed(levels, width, height), `${name} must be well-composed for the comparison to be meaningful`)
	const tree = buildTreeOfShapes(levels, width, height, levelCount)
	const fast = treeShapes(tree)
	const naive = bruteForceShapes(levels, width, height)

	const missing = Array.from(naive.keys()).filter((key) => !fast.has(key))
	const extra = Array.from(fast.keys()).filter((key) => !naive.has(key))
	assert.deepEqual(missing, [], `${name}: shapes the definition finds and the chromatic tree does not`)
	assert.deepEqual(extra, [], `${name}: shapes the chromatic tree invents and the definition does not`)

	const bySize = Array.from(naive.values()).sort((first, second) => first.length - second.length || first[0] - second[0])
	const referenceParent = new Map<string, string | null>()
	for (let index = 0; index < bySize.length; index += 1) {
		const shape = bySize[index]
		let parentKey: string | null = null
		for (let candidate = index + 1; candidate < bySize.length; candidate += 1) {
			const larger = bySize[candidate]
			if (larger.length <= shape.length) continue
			const largerMembers = new Set(larger)
			if (shape.every((pixel) => largerMembers.has(pixel))) {
				parentKey = larger.join(",")
				break
			}
		}
		referenceParent.set(shape.join(","), parentKey)
	}

	const supports = shapeSupports(tree)
	const keyOfNode = (nodeId: number): string =>
		Array.from(supports.pixels.subarray(supports.offsets[nodeId], supports.offsets[nodeId + 1]))
			.sort((first, second) => first - second)
			.join(",")
	for (let nodeId = 1; nodeId < tree.nodeCount; nodeId += 1) {
		const key = keyOfNode(nodeId)
		let ancestor = tree.nodeParent[nodeId]
		while (ancestor !== tree.rootId && keyOfNode(ancestor) === key) ancestor = tree.nodeParent[ancestor]
		const ancestorKey = keyOfNode(ancestor)
		if (ancestorKey === key) continue
		assert.equal(referenceParent.get(key), ancestorKey, `${name}: node ${nodeId}'s parent shape disagrees`)
	}
}

test("chromaLevel is symmetric about the neutral axis and inverts to within half a step", () => {
	assert.equal(chromaLevel(0), CHROMA_AXIS_STEPS)
	for (const value of [-0.3, -0.2, -0.05, -0.001, 0, 0.001, 0.05, 0.2, 0.27]) {
		const level = chromaLevel(value)
		assert.ok(level >= 0 && level < CHROMA_LEVEL_COUNT, `level ${level} for ${value} is off the axis`)
		const recovered = (level - CHROMA_AXIS_STEPS) * L_LEVEL_STEP
		assert.ok(Math.abs(recovered - value) <= L_LEVEL_STEP / 2 + 1e-12, `${value} recovered as ${recovered}`)
	}
	assert.throws(() => chromaLevel(0.6), /outside the measured sRGB bound/u)
	assert.throws(() => chromaLevel(Number.NaN), /outside the measured sRGB bound/u)
})

test("quantiseLanes agrees with a direct per-pixel recomputation", async () => {
	const directory = await mkdtemp(join(tmpdir(), "p2-lanes-quantise-"))
	try {
		const paths = await writeColorFixtures(directory)
		for (const path of paths) {
			const image = await decodeImage(path)
			const [lLane, aLane, bLane] = quantiseLanes(image)
			assert.equal(lLane.levels, image.levels, "the L lane must be the decoded levels themselves, not a copy")
			for (let pixel = 0; pixel < image.packed.length; pixel += 1) {
				const lab = rgbToOkLab(unpack(image.packed[pixel]))
				assert.equal(aLane.levels[pixel], chromaLevel(lab[1]), `${path}: a level at pixel ${pixel}`)
				assert.equal(bLane.levels[pixel], chromaLevel(lab[2]), `${path}: b level at pixel ${pixel}`)
			}
		}
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
})

test("a chromatic tree matches a brute-force level-set decomposition — synthetic covers", async () => {
	const directory = await mkdtemp(join(tmpdir(), "p2-lanes-tree-"))
	try {
		const paths = await writeColorFixtures(directory)
		const fixtures = colorFixtures()
		for (let index = 0; index < paths.length; index += 1) {
			const image = await decodeImage(paths[index])
			for (const channel of quantiseLanes(image)) {
				if (channel.lane === "L") continue
				compareToDefinition(
					`${fixtures[index].name}/${channel.lane}`,
					Int32Array.from(channel.levels),
					image.width,
					image.height,
					channel.levelCount,
				)
			}
		}
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
})

test("a chromatic tree matches a brute-force level-set decomposition — random rasters", () => {
	// Small level counts keep the naive O(levels x pixels) reference usable; the level *count* the
	// chroma lanes run at changes only the queue's width, which the hierarchical queue covers here by
	// being asked for a level count far larger than any value present.
	for (const fixture of randomWellComposedFixtures(90210, 30, 5, 4)) {
		compareToDefinition(`${fixture.name}/wide-axis`, fixture.levels, fixture.width, fixture.height, CHROMA_LEVEL_COUNT)
	}
	for (const fixture of randomWellComposedFixtures(1312, 15, 7, 3)) {
		compareToDefinition(`${fixture.name}/wide-axis`, fixture.levels, fixture.width, fixture.height, CHROMA_LEVEL_COUNT)
	}
})

test("an isoluminant mark is invisible to L and visible to a", async () => {
	const iso = isoluminantPair()
	assert.equal(lightnessLevel(iso.first), lightnessLevel(iso.second), "the fixture's premise: one quantised L level")

	const directory = await mkdtemp(join(tmpdir(), "p2-lanes-iso-"))
	try {
		const paths = await writeColorFixtures(directory)
		const index = colorFixtures().findIndex((fixture) => fixture.name === "isoluminant-mark-on-field")
		const image = await decodeImage(paths[index])
		const channels = quantiseLanes(image)

		const markPixels: number[] = []
		for (let y = 16; y < 48; y += 1) for (let x = 16; x < 48; x += 1) markPixels.push(y * image.width + x)
		const markKey = markPixels.join(",")

		/** Is there a node whose shape is exactly the mark? */
		const sees = (channel: (typeof channels)[number]): boolean => {
			const tree = buildTreeOfShapes(channel.levels, image.width, image.height, channel.levelCount)
			return treeShapes(tree).has(markKey)
		}

		const lLane = channels.find((channel) => channel.lane === "L")
		const aLane = channels.find((channel) => channel.lane === "a")
		assert.ok(lLane !== undefined && aLane !== undefined)
		// The L raster is literally constant here: one level, one node, no mark. No stability cut, no
		// area floor and no constant is involved — the node does not exist.
		assert.equal(new Set(lLane.levels).size, 1, "the fixture must be flat in L for the claim to be structural")
		assert.equal(sees(lLane), false, "the L tree must NOT contain the isoluminant mark — that is the gap")
		assert.equal(sees(aLane), true, "the a tree must contain it — that is what closing the gap means")
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
})
