/**
 * **The brute-force nesting reference.** The quasi-linear tree of shapes, checked against a naive
 * implementation of the definition on small images.
 *
 * Reconstruction (`reconstruction.test.ts`) proves the levels are right and that the shapes nest. It
 * does *not* prove they are the **right** shapes: a hierarchy could nest perfectly and still be a
 * different, wrong decomposition of the picture. This test closes that gap by computing the shapes
 * the way the definition reads — components of every level set, holes filled, duplicates removed
 * (`reference.ts`) — and asserting that the two produce the same set of regions with the same
 * containment.
 *
 * The two implementations share no code. That is the point of having them.
 */

import assert from "node:assert/strict"
import { test } from "node:test"
import { buildTreeOfShapes, shapeSupports, type ShapeTree } from "../tree.ts"
import { bruteForceShapes, handBuiltFixtures, isWellComposed, randomWellComposedFixtures, type Fixture } from "./reference.ts"

/** The set of distinct shapes the fast tree produces, keyed the same way the reference keys them. */
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

function compare(fixture: Fixture, levelCount: number): void {
	assert.ok(isWellComposed(fixture.levels, fixture.width, fixture.height), `${fixture.name} must be well-composed`)
	const tree = buildTreeOfShapes(fixture.levels, fixture.width, fixture.height, levelCount)
	const fast = treeShapes(tree)
	const naive = bruteForceShapes(fixture.levels, fixture.width, fixture.height)

	const missing = Array.from(naive.keys()).filter((key) => !fast.has(key))
	const extra = Array.from(fast.keys()).filter((key) => !naive.has(key))
	assert.deepEqual(missing, [], `${fixture.name}: shapes the definition finds and the tree does not`)
	assert.deepEqual(extra, [], `${fixture.name}: shapes the tree invents and the definition does not`)

	// Containment: the reference's inclusion tree is "smallest strictly larger shape that contains
	// me". The fast tree's parent, deduplicated onto shapes, must agree with it.
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
		// Walk up past ancestors that carry the same shape — the fast tree may name one region twice
		// (a branch point with no pixels of its own), which is not a disagreement about nesting.
		let ancestor = tree.nodeParent[nodeId]
		while (ancestor !== tree.rootId && keyOfNode(ancestor) === key) ancestor = tree.nodeParent[ancestor]
		const ancestorKey = keyOfNode(ancestor)
		if (ancestorKey === key) continue
		assert.equal(referenceParent.get(key), ancestorKey, `${fixture.name}: node ${nodeId}'s parent shape disagrees`)
	}
}

test("the tree matches a brute-force level-set decomposition — hand-built structures", () => {
	for (const fixture of handBuiltFixtures()) compare(fixture, 16)
})

test("the tree matches a brute-force level-set decomposition — randomised well-composed images", () => {
	for (const fixture of randomWellComposedFixtures(31337, 40, 5, 4)) compare(fixture, 4)
	for (const fixture of randomWellComposedFixtures(4242, 20, 7, 3)) compare(fixture, 3)
})
