/**
 * The node dump — the falsifier's and the verifier's input.
 *
 *     node --experimental-strip-types prototypes/p2-tree/tos/dump.ts <image…> --out <file.jsonl>
 *     node --experimental-strip-types prototypes/p2-tree/tos/dump.ts --set <set.txt> --out <file.jsonl>
 *
 * One JSON line per image, in the order the images were given, holding the **retained** (post
 * stability filter) nodes only, sorted by id. `SPEC.md` fixes the shared fields — `id`, `parent`,
 * `areaFraction`, `depth`, `repr` — and lets each pipeline add its own; the ones added here are the
 * quantities the parse actually decided on, so a disagreement between the dump and a palette is
 * visible without re-running anything.
 *
 * The reachability falsifier reads `repr` across all nodes of all images: if more than 25% of the
 * endorsed legacy role colours are unreachable from this set within the same-colour bar, while
 * remaining reachable from the control set of all sufficiently common exact triples, the paradigm is
 * wrong rather than under-tuned (`SPEC.md`, pre-registered before any data was seen).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { rgbToHex } from "../../../src/contract/color.ts"
import { runPipeline } from "./pipeline.ts"

/** The per-image record written to the dump. */
export type NodeDump = Readonly<{
	imagePath: string
	pipeline: "p2-tos"
	width: number
	height: number
	/** The parse's field verdict for the whole image; node roles only make sense beside it. */
	verdict: string
	/** Normalised straight-line residual of the ground chain's centroid trajectory, or null. */
	laminarity: number | null
	/** Fraction of the image the retained nodes' representative colours explain. */
	coverage: number
	/** The retained nodes forming the ground stack, outermost first. */
	groundChain: readonly number[]
	roles: Readonly<{ background: string; surface: string; foreground: string; accent: string }>
	nodes: readonly DumpNode[]
}>

export type DumpNode = Readonly<{
	id: number
	/** The retained parent's id; `-1` for the root. */
	parent: number
	areaFraction: number
	depth: number
	repr: string
	/** Pipeline-specific from here down. */
	level: number
	ownAreaFraction: number
	centroid: readonly [number, number]
	growth: number
	thinness: number | null
	kind: "field" | "mark"
	onGroundChain: boolean
}>

/** The retained nodes of one image, ready to serialise. Deterministic: ids ascend, nothing is hashed. */
export async function nodesOf(imagePath: string): Promise<NodeDump> {
	const { parse } = await runPipeline(imagePath)
	const onChain = new Set(parse.groundChain)
	return {
		imagePath,
		pipeline: "p2-tos",
		width: parse.width,
		height: parse.height,
		verdict: parse.verdict,
		laminarity: parse.laminarity,
		coverage: parse.coverage,
		groundChain: parse.groundChain,
		roles: {
			background: rgbToHex(parse.roles.background),
			surface: rgbToHex(parse.roles.surface),
			foreground: rgbToHex(parse.roles.foreground),
			accent: rgbToHex(parse.roles.accent),
		},
		nodes: parse.nodes
			.slice()
			.sort((first, second) => first.id - second.id)
			.map((node) => ({
				id: node.id,
				parent: node.parent,
				areaFraction: node.areaFraction,
				depth: node.depth,
				repr: rgbToHex(node.repr),
				level: node.level,
				ownAreaFraction: node.ownAreaFraction,
				centroid: [node.centroidX, node.centroidY] as const,
				growth: Number.isFinite(node.growth) ? node.growth : -1,
				thinness: node.thinness,
				kind: node.kind,
				onGroundChain: onChain.has(node.id),
			})),
	}
}

/** Where a set file's relative image paths resolve against — the same root the dev loop uses. */
const V3_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
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
	if (images.length === 0) throw new Error("dump.ts needs at least one image, or a --set file")
	if (out === null) throw new Error("dump.ts needs --out <file.jsonl>")

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
