/**
 * Run the merged tos candidate over a list of covers and record everything the round needs to
 * SELECT from — the published palette *and* the parse the palette came out of — in one pass.
 *
 *     node --experimental-strip-types probe.ts --set <paths.txt> --out out/<name>.jsonl
 *
 * Why not `dump.ts` plus a dev-loop run: those are two runs of the same pipeline over the same
 * image, and round 1's caveat (a dump one code version behind the run it labelled) is exactly the
 * failure mode that produces. `paletteWithDiagnostics` returns the palette and its own parse from
 * a single `runChromaPipeline` call, so a class label here can never disagree with the hex beside it.
 *
 * The node array is not copied wholesale — 638 nodes per cover over 40 covers is 100 MB of JSON the
 * selection never reads. What is kept is the parse quantities the selection ranks on, plus every
 * node whose representative IS one of the published field colours, which is what the enclosure
 * question (integration-NOTES §5 "D3, surfaces") is asked of.
 *
 * Deterministic: the input is a sorted path list, the output is one line per input line in input
 * order, no clock is read, and a failure is a row (`ok: false`) rather than an abort — a round that
 * silently dropped the covers the candidate cannot handle would be a biased round.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { rgbToHex } from "../../../../src/contract/color.ts"
import { paletteWithDiagnostics } from "../../tos/candidate.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
/** `…/prototypes/p2-tree/review-rounds/round-3-quality` → the worktree root. */
const ROOT = resolve(HERE, "..", "..", "..", "..", "..", "..")

/** A node whose representative colour is one of the two published field colours. */
export type FieldRoleNode = Readonly<{
	id: number
	role: "background" | "surface"
	kind: "field" | "mark"
	depth: number
	areaFraction: number
	ownAreaFraction: number
	onGroundChain: boolean
	/**
	 * Own area under half the shape's area — integration-NOTES §5's own definition of
	 * "enclosure-shaped": a ring, a frame, a polaroid border. The shape covers the hole; the node
	 * does not.
	 */
	enclosure: boolean
}>

export type ProbeRow = Readonly<{
	imagePath: string
	ok: boolean
	error?: string
	ms: number
	verdict?: string
	laminarity?: number | null
	coverage?: number
	groundChainLength?: number
	nodeCount?: number
	textGroupCount?: number
	palette?: Readonly<{
		background: string
		surface: string
		foreground: string
		accent: string
		gradient: null | { stops: { color: string; position: number }[] }
		surfaceCollapsed: boolean
		accentCollapsed: boolean
		algorithmVersion: string
		preprocessingVersion: string
	}>
	fieldRoleNodes?: readonly FieldRoleNode[]
	/** Whether ANY retained field node is enclosure-shaped, published or not. */
	enclosureFieldNodeCount?: number
	accentCandidates?: readonly Readonly<{
		repr: string
		lane: number
		nodeId: number
		chromaFromField: number
		lightnessMove: number
		fieldContrast: number
		stabilityLevel: number
		growth: number
	}>[]
	foregroundPoolHead?: readonly string[]
	accentPoolHead?: readonly string[]
	assembly?: Readonly<{ attempts: number; swapped: boolean; notes: readonly string[] }>
}>

/** Repo-relative, the form the fixtures publish. */
export function repoRelative(absolute: string): string {
	const prefix = ROOT.endsWith("/") ? ROOT : `${ROOT}/`
	if (!absolute.startsWith(prefix)) throw new Error(`image path outside the worktree: ${absolute}`)
	return absolute.slice(prefix.length)
}

export async function probe(relativePath: string): Promise<ProbeRow> {
	const absolute = resolve(ROOT, relativePath)
	const started = process.hrtime.bigint()
	try {
		const { palette, parse, notes, swapped, attempts } = await paletteWithDiagnostics(absolute)
		const ms = Number(process.hrtime.bigint() - started) / 1e6
		const roles = palette.roles
		const onChain = new Set(parse.groundChain)
		const fieldRoleNodes: FieldRoleNode[] = []
		let enclosureFieldNodeCount = 0
		for (const node of parse.nodes) {
			const enclosure = node.kind === "field" && node.ownAreaFraction < 0.5 * node.areaFraction
			if (enclosure) enclosureFieldNodeCount += 1
			const hex = rgbToHex(node.repr)
			const role = hex === roles.background.hex ? "background" : hex === roles.surface.hex ? "surface" : null
			if (role === null) continue
			fieldRoleNodes.push({
				id: node.id,
				role,
				kind: node.kind,
				depth: node.depth,
				areaFraction: node.areaFraction,
				ownAreaFraction: node.ownAreaFraction,
				onGroundChain: onChain.has(node.id),
				enclosure,
			})
		}
		fieldRoleNodes.sort((first, second) => first.id - second.id)
		return {
			imagePath: relativePath,
			ok: true,
			ms,
			verdict: parse.verdict,
			laminarity: parse.laminarity,
			coverage: parse.coverage,
			groundChainLength: parse.groundChain.length,
			nodeCount: parse.nodes.length,
			textGroupCount: parse.textGroups.length,
			palette: {
				background: roles.background.hex,
				surface: roles.surface.hex,
				foreground: roles.foreground.hex,
				accent: roles.accent.hex,
				gradient:
					palette.gradient === null
						? null
						: { stops: palette.gradient.stops.map((stop) => ({ color: stop.color.hex, position: stop.position })) },
				surfaceCollapsed: palette.collapse.surfaceCollapsed,
				accentCollapsed: palette.collapse.accentCollapsed,
				algorithmVersion: palette.metadata.algorithmVersion,
				preprocessingVersion: palette.metadata.preprocessingVersion,
			},
			fieldRoleNodes,
			enclosureFieldNodeCount,
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
			foregroundPoolHead: parse.foregroundPool.slice(0, 12).map(rgbToHex),
			accentPoolHead: parse.accentPool.slice(0, 12).map(rgbToHex),
			assembly: { attempts, swapped, notes },
		}
	} catch (error) {
		const ms = Number(process.hrtime.bigint() - started) / 1e6
		return { imagePath: relativePath, ok: false, ms, error: error instanceof Error ? error.message : String(error) }
	}
}

async function main(argv: readonly string[]): Promise<void> {
	let setPath: string | null = null
	let out: string | null = null
	for (let index = 0; index < argv.length; index += 1) {
		if (argv[index] === "--set") {
			setPath = argv[index + 1] ?? null
			index += 1
		} else if (argv[index] === "--out") {
			out = argv[index + 1] ?? null
			index += 1
		}
	}
	if (setPath === null || out === null) throw new Error("probe.ts --set <paths.txt> --out <file.jsonl>")

	const text = await readFile(isAbsolute(setPath) ? setPath : resolve(HERE, setPath), "utf8")
	const paths = text
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "" && !line.startsWith("#"))

	const rows: ProbeRow[] = []
	for (const path of paths) {
		const row = await probe(path)
		rows.push(row)
		process.stderr.write(`${row.ok ? "ok  " : "FAIL"} ${row.ms.toFixed(0).padStart(5)}ms  ${path}${row.ok ? "" : `  ${row.error}`}\n`)
	}
	const outPath = isAbsolute(out) ? out : resolve(HERE, out)
	await mkdir(dirname(outPath), { recursive: true })
	// The `ms` field is a wall-clock measurement and is NOT written: this file is compared
	// byte-for-byte across rebuilds, and a timing would make every rebuild differ.
	await writeFile(outPath, `${rows.map((row) => JSON.stringify({ ...row, ms: undefined })).join("\n")}\n`, "utf8")
	const failed = rows.filter((row) => !row.ok).length
	process.stderr.write(`wrote ${rows.length} rows (${failed} failed) to ${outPath}\n`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
	await main(process.argv.slice(2))
}
