/**
 * Check 3 — dump structural invariants, over both `demo-20` node dumps.
 *
 * Parent existence, areaFraction range, monotone nesting, id ordering, retained-node counts.
 * Root is identified as the node whose parent does not name another node; the two pipelines spell
 * that differently (`null` vs `-1`), which is itself recorded rather than normalized away silently.
 */

import { readJsonl } from "./lib.ts"

const P2 = new URL("../", import.meta.url).pathname

/** Tolerance on the child ≤ parent area comparison, to absorb float printing. [UNCALIBRATED] — chosen here. */
export const AREA_EPSILON = 1e-9

for (const [label, path] of [
	["alpha", `${P2}alpha/out/demo-20.nodes.jsonl`],
	["tos", `${P2}tos/out/demo-20.nodes.jsonl`],
] as const) {
	const lines = await readJsonl<any>(path)
	let missingParent = 0
	let areaOutOfRange = 0
	let nestingViolations = 0
	let idsUnsorted = 0
	let idsNonUnique = 0
	let rootCount = 0
	let cycles = 0
	const rootSpellings = new Set<string>()
	const counts: number[] = []
	const nestingExamples: string[] = []

	for (const line of lines) {
		const nodes: any[] = line.nodes
		counts.push(nodes.length)
		const byId = new Map<number, any>(nodes.map((n) => [n.id, n]))
		if (byId.size !== nodes.length) idsNonUnique++
		for (let i = 1; i < nodes.length; i++) if (nodes[i].id <= nodes[i - 1].id) idsUnsorted++

		let roots = 0
		for (const n of nodes) {
			const hasParent = byId.has(n.parent)
			if (!hasParent) {
				roots++
				rootSpellings.add(JSON.stringify(n.parent))
				if (n.parent !== null && n.parent !== -1) missingParent++
			}
			if (!(n.areaFraction > 0 && n.areaFraction <= 1 + AREA_EPSILON)) areaOutOfRange++
			if (hasParent) {
				const p = byId.get(n.parent)!
				if (n.areaFraction > p.areaFraction + AREA_EPSILON) {
					nestingViolations++
					if (nestingExamples.length < 5)
						nestingExamples.push(
							`${label} ${line.imagePath.split("/").pop()} node${n.id}(${n.areaFraction.toFixed(6)}) > parent${p.id}(${p.areaFraction.toFixed(6)})`,
						)
				}
				// walk to root, bounded, to catch cycles
				let cur = n
				let steps = 0
				while (byId.has(cur.parent) && steps++ < nodes.length + 1) cur = byId.get(cur.parent)!
				if (steps > nodes.length) cycles++
			}
		}
		if (roots !== 1) rootCount++
	}

	const sorted = [...counts].sort((a, b) => a - b)
	console.log(
		JSON.stringify({
			check: "dump-invariants",
			pipeline: label,
			images: lines.length,
			totalNodes: counts.reduce((a, b) => a + b, 0),
			retainedPerImage: {
				min: sorted[0],
				median: sorted[Math.floor(sorted.length / 2)],
				max: sorted[sorted.length - 1],
			},
			rootSpellings: [...rootSpellings],
			imagesWithoutExactlyOneRoot: rootCount,
			danglingParentIds: missingParent,
			areaFractionOutOfRange: areaOutOfRange,
			childAreaExceedsParent: nestingViolations,
			nestingExamples,
			idsNotStrictlyAscending: idsUnsorted,
			imagesWithDuplicateIds: idsNonUnique,
			cyclesDetected: cycles,
		}),
	)
}
