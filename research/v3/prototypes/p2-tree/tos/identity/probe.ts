/**
 * Scratch probe — prints the parse shape for one image so the q1/q2/q3 scripts can be written
 * against real field names rather than against the type declarations.
 *
 * Not a deliverable. Kept because it is the provenance of the field names the reports use.
 */

import { runChromaPipeline } from "../lanes/pool.ts"

const imagePath = process.argv[2]
const { image, lanes, parse } = await runChromaPipeline(imagePath)
console.log("image", image.width, image.height, image.format)
console.log("laneNodeCounts", lanes.map((lane) => lane.nodes.length))
console.log("parse.nodes", parse.nodes.length)
console.log("verdict", parse.verdict, "coverage", parse.coverage, "gradient", parse.gradient)
console.log("roles", parse.roles)
console.log("notes", parse.notes)
console.log("textGroups", parse.textGroups.length)
for (const group of parse.textGroups.slice(0, 4)) {
	console.log("  group", {
		repr: group.repr,
		rows: group.rows,
		areaFraction: group.areaFraction,
		fieldContrast: group.fieldContrast,
		nodeCount: group.nodeIds.length,
		nodeIds: group.nodeIds.slice(0, 20),
	})
}
console.log("foregroundPool[0..9]", parse.foregroundPool.slice(0, 10))
console.log("accentPool[0..5]", parse.accentPool.slice(0, 6))
