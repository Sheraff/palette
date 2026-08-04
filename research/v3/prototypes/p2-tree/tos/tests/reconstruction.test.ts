/**
 * **The reconstruction test.** Rebuild the quantised image from the tree alone and compare it to the
 * input, pixel for pixel.
 *
 * This is the test the prototype is not allowed to ship without. `SPEC.md` and the cycle brief both
 * say why: a subtly wrong tree fails *silently* — every node still has an area, a centroid and a
 * representative colour, every palette it produces still validates, and nothing downstream can tell
 * that the hierarchy is wrong. Reconstruction cannot be satisfied by a plausible-looking tree; it is
 * satisfied only by one whose shapes genuinely nest and whose levels are genuinely the image's.
 *
 * Beside it, three structural properties that a hierarchy either has or does not:
 *
 *  - a parent's id is always below its child's, which the attribute roll-ups depend on;
 *  - a child's shape is a **strict subset** of its parent's, which is what makes it a tree of shapes
 *    rather than an arbitrary graph of regions;
 *  - the root's shape is the whole image.
 */

import assert from "node:assert/strict"
import { test } from "node:test"
import { L_LEVEL_COUNT } from "../constants.ts"
import { buildTreeOfShapes, reconstruct, shapeSupports, type ShapeTree } from "../tree.ts"
import { handBuiltFixtures, isWellComposed, makeRandom, randomWellComposedFixtures } from "./reference.ts"

function assertReconstructs(levels: Int32Array, width: number, height: number, levelCount: number, name: string): ShapeTree {
	const tree = buildTreeOfShapes(levels, width, height, levelCount)
	const rebuilt = reconstruct(tree)
	for (let pixel = 0; pixel < levels.length; pixel += 1) {
		assert.equal(
			rebuilt[pixel],
			levels[pixel],
			`${name}: pixel ${pixel} (x=${pixel % width}, y=${Math.floor(pixel / width)}) rebuilt as ${rebuilt[pixel]}, image says ${levels[pixel]}`,
		)
	}
	return tree
}

function assertStructure(tree: ShapeTree, name: string): void {
	assert.equal(tree.rootId, 0, `${name}: the root is the first node`)
	assert.equal(tree.nodeParent[tree.rootId], tree.rootId, `${name}: the root is its own parent`)
	assert.equal(tree.nodeSubtreeArea[tree.rootId], tree.width * tree.height, `${name}: the root's shape is the whole image`)

	for (let nodeId = 1; nodeId < tree.nodeCount; nodeId += 1) {
		assert.ok(tree.nodeParent[nodeId] < nodeId, `${name}: node ${nodeId}'s parent must have a lower id`)
		assert.equal(tree.nodeDepth[nodeId], tree.nodeDepth[tree.nodeParent[nodeId]] + 1, `${name}: depth follows the parent`)
	}

	const supports = shapeSupports(tree)
	const setOf = (nodeId: number): Set<number> =>
		new Set(Array.from(supports.pixels.subarray(supports.offsets[nodeId], supports.offsets[nodeId + 1])))
	for (let nodeId = 1; nodeId < tree.nodeCount; nodeId += 1) {
		const child = setOf(nodeId)
		const parent = setOf(tree.nodeParent[nodeId])
		assert.ok(child.size > 0, `${name}: node ${nodeId} has an empty shape`)
		assert.ok(child.size < parent.size, `${name}: node ${nodeId}'s shape must be strictly inside its parent's`)
		for (const pixel of child) assert.ok(parent.has(pixel), `${name}: node ${nodeId} has a pixel its parent does not`)
	}
}

test("the quantised image is rebuilt exactly from the tree — hand-built structures", () => {
	for (const fixture of handBuiltFixtures()) {
		assert.ok(isWellComposed(fixture.levels, fixture.width, fixture.height), `${fixture.name} must be well-composed`)
		const tree = assertReconstructs(fixture.levels, fixture.width, fixture.height, 16, fixture.name)
		assertStructure(tree, fixture.name)
	}
})

test("the quantised image is rebuilt exactly from the tree — randomised images", () => {
	// Deliberately *not* restricted to well-composed images: the immersion is what makes the tree
	// well-defined on the ambiguous configurations too, and reconstruction has to hold there as well.
	const random = makeRandom(20260804)
	for (let index = 0; index < 60; index += 1) {
		const width = 3 + Math.floor(random() * 8)
		const height = 3 + Math.floor(random() * 8)
		const levelCount = 2 + Math.floor(random() * 12)
		const levels = new Int32Array(width * height)
		for (let pixel = 0; pixel < levels.length; pixel += 1) levels[pixel] = Math.floor(random() * levelCount)
		const name = `random-${index}-${width}x${height}-L${levelCount}`
		const tree = assertReconstructs(levels, width, height, levelCount, name)
		assertStructure(tree, name)
	}
})

test("the quantised image is rebuilt exactly from the tree — well-composed randomised images", () => {
	for (const fixture of randomWellComposedFixtures(7, 25, 5, 4)) {
		const tree = assertReconstructs(fixture.levels, fixture.width, fixture.height, 4, fixture.name)
		assertStructure(tree, fixture.name)
	}
})

test("the quantised image is rebuilt exactly from the tree — a full 256-level ramp at cover scale", () => {
	// The real quantisation, on an image big enough to exercise the hierarchical queue's level
	// searching: a diagonal ramp plus a lump, 120 x 120, every level occupied.
	const size = 120
	const levels = new Int32Array(size * size)
	for (let y = 0; y < size; y += 1) {
		for (let x = 0; x < size; x += 1) {
			const ramp = Math.floor(((x + y) / (2 * size - 2)) * (L_LEVEL_COUNT - 1))
			const inLump = (x - 80) ** 2 + (y - 40) ** 2 < 18 ** 2
			levels[y * size + x] = inLump ? 250 : ramp
		}
	}
	const tree = assertReconstructs(levels, size, size, L_LEVEL_COUNT, "ramp-with-lump")
	assertStructure(tree, "ramp-with-lump")
	assert.ok(tree.nodeCount > 100, "a 256-level ramp should produce a long chain, not a flat partition")
})
