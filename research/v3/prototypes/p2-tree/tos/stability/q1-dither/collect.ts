/**
 * Stage 1 of the dither-churn localisation: run the `tos` pipeline on **both sides** of every
 * `dither-lsb1` trial and write one trace line per cover.
 *
 *     NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *       research/v3/prototypes/p2-tree/tos/stability/q1-dither/collect.ts [--limit N]
 *
 * The two sides are the materialised perturbation images the robustness harness already wrote
 * (`data/robustness/cache/dither-lsb1/<sha16>.dither-lsb1.{baseline,perturbed}.png`), so this study
 * measures exactly the pixels that produced the 66 published disagreements — not a re-perturbation.
 *
 * Deterministic: covers are processed in ascending `artworkId` order, nodes are already id-sorted by
 * the pipeline, and nothing here consults a hash, a clock or a filename beyond the cache key.
 */

import { existsSync, readFileSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { rgbToHex } from "../../../../../src/contract/color.ts"
import { runPipeline } from "../../pipeline.ts"
import { ARM, CANDIDATE, STUDY_VERSION } from "./constants.ts"
import { traceRoles } from "./trace.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const V3_ROOT = resolve(HERE, "../../../../..")
const OUT_DIR = resolve(HERE, "out")

type Cover = Readonly<{ artworkId: string; path: string; sha256: string; width: number; height: number; reviewedness: string; tier: string }>

type SideTrace = Readonly<{
	imagePath: string
	width: number
	height: number
	verdict: string
	coverage: number
	laminarity: number | null
	gradient: boolean
	groundChain: readonly number[]
	roles: Readonly<{ background: string; surface: string; foreground: string; accent: string }>
	roleNodes: Readonly<{ background: number; surface: number }>
	/** Aligned with `foregroundPool` / `accentPool`. */
	foregroundPool: readonly string[]
	accentPool: readonly string[]
	foregroundSources: readonly unknown[]
	accentSources: readonly unknown[]
	nodes: readonly Readonly<{
		id: number
		parent: number
		areaFraction: number
		ownAreaFraction: number
		cx: number
		cy: number
		depth: number
		level: number
		kind: string
		repr: string
	}>[]
}>

async function traceOne(imagePath: string): Promise<SideTrace> {
	const { image, parse } = await runPipeline(imagePath)
	const sources = traceRoles(image, parse)
	return {
		imagePath,
		width: image.width,
		height: image.height,
		verdict: parse.verdict,
		coverage: parse.coverage,
		laminarity: parse.laminarity,
		gradient: parse.gradient,
		groundChain: parse.groundChain,
		roles: {
			background: rgbToHex(parse.roles.background),
			surface: rgbToHex(parse.roles.surface),
			foreground: rgbToHex(parse.roles.foreground),
			accent: rgbToHex(parse.roles.accent),
		},
		roleNodes: { background: sources.background.nodeId as number, surface: sources.surface.nodeId as number },
		foregroundPool: parse.foregroundPool.map(rgbToHex),
		accentPool: parse.accentPool.map(rgbToHex),
		foregroundSources: sources.foregroundPool,
		accentSources: sources.accentPool,
		nodes: parse.nodes.map((node) => ({
			id: node.id,
			parent: node.parent,
			areaFraction: node.areaFraction,
			ownAreaFraction: node.ownAreaFraction,
			cx: node.centroidX,
			cy: node.centroidY,
			depth: node.depth,
			level: node.level,
			kind: node.kind,
			repr: rgbToHex(node.repr),
		})),
	}
}

async function main(): Promise<void> {
	const limitFlag = process.argv.indexOf("--limit")
	const limit = limitFlag >= 0 ? Number(process.argv[limitFlag + 1]) : Number.POSITIVE_INFINITY

	const setPath = resolve(V3_ROOT, "data/robustness/perturbation-set-1.json")
	const set = JSON.parse(readFileSync(setPath, "utf8")) as { covers: Cover[] }
	const covers = set.covers.slice().sort((first, second) => (first.artworkId < second.artworkId ? -1 : first.artworkId > second.artworkId ? 1 : 0))

	await mkdir(OUT_DIR, { recursive: true })
	const lines: string[] = []
	let index = 0
	for (const cover of covers) {
		if (index >= limit) break
		index += 1
		const key = cover.sha256.slice(0, 16)
		const baseline = resolve(V3_ROOT, `data/robustness/cache/${ARM}/${key}.${ARM}.baseline.png`)
		const perturbed = resolve(V3_ROOT, `data/robustness/cache/${ARM}/${key}.${ARM}.perturbed.png`)
		if (!existsSync(baseline) || !existsSync(perturbed)) {
			lines.push(JSON.stringify({ artworkId: cover.artworkId, error: "missing-cache-image", baseline, perturbed }))
			process.stderr.write(`[${index}/${covers.length}] ${cover.artworkId} MISSING\n`)
			continue
		}
		const started = Date.now()
		try {
			const left = await traceOne(baseline)
			const right = await traceOne(perturbed)
			lines.push(
				JSON.stringify({
					artworkId: cover.artworkId,
					sourcePath: cover.path,
					sha256: cover.sha256,
					reviewedness: cover.reviewedness,
					tier: cover.tier,
					left,
					right,
				}),
			)
			process.stderr.write(`[${index}/${covers.length}] ${cover.artworkId} ${Date.now() - started}ms L=${left.nodes.length} R=${right.nodes.length}\n`)
		} catch (error) {
			lines.push(JSON.stringify({ artworkId: cover.artworkId, error: String(error instanceof Error ? error.message : error) }))
			process.stderr.write(`[${index}/${covers.length}] ${cover.artworkId} ERROR ${String(error)}\n`)
		}
	}

	await writeFile(resolve(OUT_DIR, "traces.jsonl"), `${lines.join("\n")}\n`, "utf8")
	process.stderr.write(`wrote ${lines.length} traces (${STUDY_VERSION}, ${CANDIDATE}/${ARM})\n`)
}

await main()
