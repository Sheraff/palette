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
 * **Since the cycle-2 integration pass this is the merged pool: all three lanes.** The L lane keeps ids
 * `0…n-1` exactly as round 1 published them; the a and b lanes are appended in one id space, each root
 * re-parented onto the L root (the same image rectangle at the same area fraction), so the file is still
 * one tree per line and the reachability question is asked of every node the candidate can reach.
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
import { ROLE_NAMES } from "../../../src/contract/constants.ts"
import { runChromaPipeline } from "./lanes/pool.ts"
import { roleMargins } from "./roles/indifference.ts"

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
	/**
	 * **D7's pairwise role margins**, worst ratio first — the OKLab distance between each pair of the
	 * roles above, the contract's regional bar for that pair, and the ratio of the two.
	 *
	 * `DECISIONS.md` D7: *"the reviewer grades margins; optimizers sit on floors"* — the
	 * twins-must-collapse walk enforces distinctness **at** the bar, so a pair at bar + 1e-4 publishes as
	 * "distinct" and is a complaint waiting to happen. Reported here so a round's staging does not have to
	 * recompute it and so a margin audit is a read of an artefact. **Report-only**: nothing ranks or
	 * filters on it.
	 *
	 * These are the **parse's** roles, which is what the `roles` field above already reports; the
	 * assembly walk in `candidate.ts` can move the foreground and the accent, and its margins are on
	 * `CandidateDiagnostics.margins`.
	 */
	roleMargins: readonly DumpRoleMargin[]
	nodes: readonly DumpNode[]
	/**
	 * Every clustered accent candidate, in the published order, with all four measurements.
	 *
	 * `DECISIONS.md` D1 ruled the accent order back to chroma-first and kept the APCA measurement W-F's
	 * rewrite ranked on as a **reported** quantity, so the coming round can price the readability-vs-
	 * identity exchange rate on the numbers the pipeline actually saw.
	 */
	accentCandidates: readonly DumpAccentCandidate[]
}>

export type DumpRoleMargin = Readonly<{
	/** `"<role>|<role>"`, roles in `ROLE_NAMES` order. */
	pair: string
	distance: number
	bar: number
	/** `distance / bar`. Below 1 the pair is inside the bar. */
	ratio: number
}>

export type DumpAccentCandidate = Readonly<{
	repr: string
	/** 0 is the L lane; then the chromatic lanes in `lanes/constants.ts`'s `LANES` order. */
	lane: number
	nodeId: number
	chromaFromField: number
	lightnessMove: number
	fieldContrast: number
	/** D3's eligibility level: 0 may lead an identity role, 1 is an incidental node. */
	stabilityLevel: number
	growth: number
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
	const { parse } = await runChromaPipeline(imagePath)
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
		roleMargins: roleMargins(
			{
				background: { rgb: parse.roles.background },
				surface: { rgb: parse.roles.surface },
				foreground: { rgb: parse.roles.foreground },
				accent: { rgb: parse.roles.accent },
			},
			ROLE_NAMES,
		),
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
		accentCandidates: parse.accentCandidates.map((candidate) => ({
			repr: rgbToHex(candidate.repr),
			lane: candidate.laneIndex,
			nodeId: candidate.nodeId,
			chromaFromField: candidate.chromaFromField,
			lightnessMove: candidate.lightnessMove,
			fieldContrast: candidate.fieldContrast,
			stabilityLevel: candidate.stabilityLevel,
			growth: Number.isFinite(candidate.growth) ? candidate.growth : -1,
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
