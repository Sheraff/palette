/**
 * The node dump — the falsifier's and the verifier's input (SPEC "Shared interface" §2).
 *
 * One JSON line per image: the retained (post-grain-fold) nodes of the α-tree, sorted by id, with
 * the representative each one publishes. This is what makes the pre-registered **reachability**
 * falsifier answerable — *do endorsed colours live in tree nodes at all* — without anyone having to
 * re-derive the tree from a palette, and it is deliberately the same parse the palette came from
 * (`parse.ts`), so a dump can never describe a tree the candidate did not use.
 *
 * ```
 * node --experimental-strip-types prototypes/p2-tree/alpha/dump.ts \
 *   --set data/devloop/sets/demo-20.txt --out prototypes/p2-tree/alpha/out/demo-20.nodes.jsonl
 * node --experimental-strip-types prototypes/p2-tree/alpha/dump.ts a.jpg b.jpg --out nodes.jsonl
 * ```
 *
 * Rows are flushed as they are produced (`CONVENTIONS.md`: long runs are resumable from their output
 * and deliberately killable), and a failed image is a row carrying its error rather than a gap.
 */

import { createWriteStream } from "node:fs"
import { mkdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { rgbToHex } from "../../../src/contract/color.ts"
import { readImageSet } from "../../../src/devloop/run.ts"
import { PIPELINE_NAME } from "./constants.ts"
import { parseImage } from "./parse.ts"

export type DumpedNode = Readonly<{
	id: number
	parent: number | null
	areaFraction: number
	depth: number
	repr: string
	// ------- pipeline-specific, all of it derived from the α-tree -------
	/** `zone` = an α-zone (a tree leaf); `group` = a Kruskal merge of zones above one bar. */
	kind: "zone" | "group"
	/** The level in bars at which this node formed. Leaves carry α = 1, the contract's own ruler. */
	levelBars: number
	/** The node's subtree holds at least one border-touching α-zone. */
	containsField: boolean
	/** Every α-zone in the subtree touches the border: the node is field and nothing else. */
	fieldOnly: boolean
	/** Fraction of the node's own pixels that lie on the image border. */
	borderFraction: number
	/** How much of the node reads as `repr` — the mass inside one bar of the density mode. */
	modeFraction: number
	/** The node's id in the unfiltered hierarchy, for joining a dump to a re-run of the tree. */
	hierarchyId: number
}>

export type NodeDump = Readonly<{
	imagePath: string
	pipeline: string
	width: number
	height: number
	/** The field's typing, so a reader can split reachability by parse outcome rather than by guess. */
	fieldModel: "flat" | "linear" | "none"
	nodes: readonly DumpedNode[]
}>

/** The dump for one image. Nodes are already in DFS pre-order, which is ascending id. */
export async function nodesOf(imagePath: string): Promise<NodeDump> {
	const parse = await parseImage(imagePath)
	return {
		imagePath,
		pipeline: PIPELINE_NAME,
		width: parse.image.width,
		height: parse.image.height,
		fieldModel: parse.model.kind,
		nodes: parse.nodes.map((node) => ({
			id: node.id,
			parent: node.parent,
			areaFraction: node.areaFraction,
			depth: node.depth,
			repr: rgbToHex(node.representative.rgb),
			kind: node.kind,
			levelBars: node.levelBars,
			containsField: node.containsField,
			fieldOnly: node.fieldOnly,
			borderFraction: node.borderFraction,
			modeFraction: node.representative.modeFraction,
			hierarchyId: node.hierarchyId,
		})),
	}
}

function flag(argv: readonly string[], name: string): string | undefined {
	const at = argv.indexOf(name)
	return at === -1 || at + 1 >= argv.length ? undefined : argv[at + 1]
}

async function main(argv: readonly string[]): Promise<number> {
	const outPath = flag(argv, "--out")
	if (outPath === undefined) {
		process.stdout.write("usage: dump.ts [<image>…] [--set <set.txt>] --out <file.jsonl>\n")
		return 2
	}
	const setPath = flag(argv, "--set")
	const explicit = argv.filter((argument, index) =>
		!argument.startsWith("--") && argv[index - 1] !== "--out" && argv[index - 1] !== "--set"
	)
	const imagePaths = setPath === undefined
		? explicit.map((path) => resolve(path))
		: [...(await readImageSet(setPath)).imagePaths, ...explicit.map((path) => resolve(path))]
	if (imagePaths.length === 0) {
		process.stdout.write("dump.ts: no images\n")
		return 2
	}

	const absoluteOut = resolve(outPath)
	await mkdir(dirname(absoluteOut), { recursive: true })
	const stream = createWriteStream(absoluteOut, { encoding: "utf8" })
	let failed = 0
	let nodeTotal = 0
	for (const imagePath of imagePaths) {
		try {
			const dump = await nodesOf(imagePath)
			nodeTotal += dump.nodes.length
			stream.write(`${JSON.stringify(dump)}\n`)
		} catch (error) {
			failed += 1
			stream.write(`${JSON.stringify({ imagePath, pipeline: PIPELINE_NAME, error: (error as Error).message })}\n`)
		}
	}
	await new Promise<void>((done) => stream.end(done))
	process.stdout.write(
		`${absoluteOut}\n  ${imagePaths.length - failed} dumped · ${failed} failed · ${nodeTotal} nodes\n`,
	)
	return failed > 0 ? 1 : 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = await main(process.argv.slice(2))
}
