/**
 * The lane-tagged node dump — `../dump.ts`'s shape, plus the one attribute that makes three lanes
 * legible.
 *
 *     node --experimental-strip-types prototypes/p2-tree/tos/lanes/dump.ts <image…> --out <file.jsonl>
 *     node --experimental-strip-types prototypes/p2-tree/tos/lanes/dump.ts --set <set.txt> --out <file.jsonl>
 *
 * One JSON line per image, retained nodes only, sorted by id. `SPEC.md` fixes `id`, `parent`,
 * `areaFraction`, `depth`, `repr`; everything else is pipeline-specific and matches `../dump.ts`
 * field for field so the falsifier and the verifier read both files with one reader.
 *
 * **`lane` is the new attribute** and `id` is now global across the three trees: the L lane keeps ids
 * `0 … nL-1` (so a row's L nodes are comparable to `p2-tos`'s dump line for the same cover), the a
 * lane is offset by `nL`, the b lane by `nL + nA`. `parent` is in the same global space, and a lane's
 * root keeps `-1`. Ids therefore still ascend, still name a unique node, and never cross a lane.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { rgbToHex } from "../../../../src/contract/color.ts"
import type { Lane } from "./constants.ts"
import { runChromaPipeline } from "./pool.ts"

/** The per-image record written to the dump. */
export type LaneNodeDump = Readonly<{
	imagePath: string
	pipeline: "p2-tos-chroma"
	width: number
	height: number
	/** The L lane's field verdict; node roles only make sense beside it. */
	verdict: string
	laminarity: number | null
	coverage: number
	/** The L lane's ground stack, outermost first, in the global id space (which is the L lane's). */
	groundChain: readonly number[]
	roles: Readonly<{ background: string; surface: string; foreground: string; accent: string }>
	/** Retained node counts per lane, in `LANES` order. */
	nodeCountByLane: readonly number[]
	nodes: readonly LaneDumpNode[]
}>

export type LaneDumpNode = Readonly<{
	id: number
	/** The retained parent's global id; `-1` for a lane's root. */
	parent: number
	areaFraction: number
	depth: number
	repr: string
	/** Pipeline-specific from here down. */
	lane: Lane
	level: number
	ownAreaFraction: number
	centroid: readonly [number, number]
	growth: number
	thinness: number | null
	kind: "field" | "mark"
	onGroundChain: boolean
}>

/** The retained nodes of one image across all three lanes. Deterministic: ids ascend, nothing is hashed. */
export async function nodesOf(imagePath: string): Promise<LaneNodeDump> {
	const { lanes, base, parse } = await runChromaPipeline(imagePath)
	const onChain = new Set(base.groundChain)

	const offsets: number[] = []
	let running = 0
	for (const built of lanes) {
		offsets.push(running)
		running += built.nodes.length
	}

	const nodes: LaneDumpNode[] = []
	for (let laneIndex = 0; laneIndex < lanes.length; laneIndex += 1) {
		const built = lanes[laneIndex]
		const offset = offsets[laneIndex]
		for (const node of built.nodes.slice().sort((first, second) => first.id - second.id)) {
			nodes.push({
				id: offset + node.id,
				parent: node.parent === -1 ? -1 : offset + node.parent,
				areaFraction: node.areaFraction,
				depth: node.depth,
				repr: rgbToHex(node.repr),
				lane: node.lane,
				level: node.level,
				ownAreaFraction: node.ownAreaFraction,
				centroid: [node.centroidX, node.centroidY] as const,
				growth: Number.isFinite(node.growth) ? node.growth : -1,
				thinness: node.thinness,
				kind: node.kind,
				// Only the L lane has a ground chain; the chromatic lanes contribute candidates, not fields.
				onGroundChain: laneIndex === 0 && onChain.has(node.id),
			})
		}
	}

	return {
		imagePath,
		pipeline: "p2-tos-chroma",
		width: base.width,
		height: base.height,
		verdict: base.verdict,
		laminarity: base.laminarity,
		coverage: base.coverage,
		groundChain: base.groundChain,
		roles: {
			background: rgbToHex(parse.roles.background),
			surface: rgbToHex(parse.roles.surface),
			foreground: rgbToHex(parse.roles.foreground),
			accent: rgbToHex(parse.roles.accent),
		},
		nodeCountByLane: lanes.map((built) => built.nodes.length),
		nodes,
	}
}

/** Where a set file's relative image paths resolve against — the same root the dev loop uses. */
const V3_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..")
const REPO_ROOT = resolve(V3_ROOT, "..", "..")

async function main(argv: readonly string[]): Promise<void> {
	const images: string[] = []
	let out: string | null = null
	let setPath: string | null = null
	for (let index = 0; index < argv.length; index += 1) {
		if (argv[index] === "--out") {
			out = argv[index + 1]
			index += 1
		} else if (argv[index] === "--set") {
			setPath = argv[index + 1]
			index += 1
		} else {
			images.push(argv[index])
		}
	}
	if (setPath !== null) {
		const text = await readFile(resolve(setPath), "utf8")
		for (const line of text.split("\n")) {
			const trimmed = line.trim()
			if (trimmed === "" || trimmed.startsWith("#")) continue
			images.push(isAbsolute(trimmed) ? trimmed : resolve(REPO_ROOT, trimmed))
		}
	}
	if (images.length === 0) throw new Error("lanes/dump.ts needs at least one image, or a --set file")
	if (out === null) throw new Error("lanes/dump.ts needs --out <file.jsonl>")

	const lines: string[] = []
	for (const image of images) {
		const absolute = isAbsolute(image) ? image : resolve(REPO_ROOT, image)
		lines.push(JSON.stringify(await nodesOf(absolute)))
	}
	const outPath = resolve(out)
	await mkdir(dirname(outPath), { recursive: true })
	await writeFile(outPath, `${lines.join("\n")}\n`, "utf8")
	process.stderr.write(`wrote ${lines.length} rows to ${outPath}\n`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
	await main(process.argv.slice(2))
}
