/**
 * Stage 1 of the laminarity sweep: extract, per cover, the **five quantities the verdict rule reads**
 * so the grid can be swept without re-running the pipeline once per cell.
 *
 *     NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *       research/v3/prototypes/p2-tree/tos/stability/q2-laminarity/collect.ts [--limit N]
 *
 * `parseTree`'s verdict depends on exactly: `coverage`, the ground chain's length, the chain's
 * `laminarity` (straightness residual over trajectory length), the chain's centroid *monotonicity*,
 * whether the two chain ends are distinct under the contract's bar, and how many field-sized
 * siblings the root has. Only `monotonicity` is not on the published `Parse`, so it is recomputed
 * here from the same chain centroids — and `laminarity` is recomputed alongside it and checked
 * against the parse's own value, which is what makes the recomputation trustworthy rather than a
 * second implementation nobody compared.
 *
 * The gradient boolean then follows with no further pipeline state: `laminar` ⇒ the two ends *are*
 * background and surface (`SPEC.md`'s endpoint ruling), and `candidate.ts` publishes
 * `gradient: null` when they collapse to the same hex.
 */

import { existsSync, readFileSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { colorFromRgb, okLabDistance, rgbToHex, rgbToOkLab, sameColorBar } from "../../../../../src/contract/color.ts"
import { FIELD_AREA_FRACTION } from "../../constants.ts"
import { runPipeline } from "../../pipeline.ts"
import { STUDY_VERSION } from "./constants.ts"
import { loadGradientLabels } from "./labels.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const V3_ROOT = resolve(HERE, "../../../../..")
const REPO_ROOT = resolve(V3_ROOT, "../..")
const OUT_DIR = resolve(HERE, "out")

/** `pipeline.ts`'s `collinearityResidual`, re-derived so `monotonicity` is available. Checked against the parse. */
function chainGeometry(points: readonly (readonly [number, number])[]): { residual: number; length: number; monotonicity: number } {
	if (points.length < 2) return { residual: 0, length: 0, monotonicity: 1 }
	let meanX = 0
	let meanY = 0
	for (const [x, y] of points) {
		meanX += x
		meanY += y
	}
	meanX /= points.length
	meanY /= points.length
	let sxx = 0
	let syy = 0
	let sxy = 0
	for (const [x, y] of points) {
		const dx = x - meanX
		const dy = y - meanY
		sxx += dx * dx
		syy += dy * dy
		sxy += dx * dy
	}
	const trace = sxx + syy
	const determinant = sxx * syy - sxy * sxy
	const discriminant = Math.sqrt(Math.max(0, (trace / 2) ** 2 - determinant))
	const major = trace / 2 + discriminant
	let dirX = sxy
	let dirY = major - sxx
	const norm = Math.hypot(dirX, dirY)
	if (norm === 0) {
		dirX = 1
		dirY = 0
	} else {
		dirX /= norm
		dirY /= norm
	}
	let squared = 0
	const projections: number[] = []
	for (const [x, y] of points) {
		const dx = x - meanX
		const dy = y - meanY
		squared += (dx * -dirY + dy * dirX) ** 2
		projections.push(dx * dirX + dy * dirY)
	}
	const residual = Math.sqrt(squared / points.length)
	const length = Math.max(...projections) - Math.min(...projections)
	let net = 0
	let total = 0
	for (let index = 1; index < projections.length; index += 1) {
		const step = projections[index] - projections[index - 1]
		net += step
		total += Math.abs(step)
	}
	return { residual, length, monotonicity: total > 0 ? Math.abs(net) / total : 1 }
}

export type Geometry = Readonly<{
	imagePath: string
	membership: readonly string[]
	width: number
	height: number
	coverage: number
	chainLength: number
	laminarity: number | null
	monotonicity: number
	endsDistinct: boolean
	fieldSiblings: number
	endHexA: string
	endHexB: string
	currentVerdict: string
	currentGradient: boolean
	currentRoles: Readonly<{ background: string; surface: string; foreground: string; accent: string }>
	/** `|recomputed laminarity - parse.laminarity|`; a non-zero value invalidates the sweep. */
	laminarityCheck: number
}>

function demoTwentyPaths(): string[] {
	const file = resolve(V3_ROOT, "data/devloop/sets/demo-20.txt")
	return readFileSync(file, "utf8")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith("#"))
}

async function main(): Promise<void> {
	const limitFlag = process.argv.indexOf("--limit")
	const limit = limitFlag >= 0 ? Number(process.argv[limitFlag + 1]) : Number.POSITIVE_INFINITY

	const demo = demoTwentyPaths()
	const labelSet = loadGradientLabels()
	const endorsed = labelSet.labels.map((label) => label.imagePath)

	const membership = new Map<string, Set<string>>()
	const add = (path: string, tag: string): void => {
		let tags = membership.get(path)
		if (tags === undefined) {
			tags = new Set()
			membership.set(path, tags)
		}
		tags.add(tag)
	}
	for (const path of demo) add(path, "demo-20")
	for (const path of endorsed) add(path, "endorsed-173")

	const paths = Array.from(membership.keys()).sort()
	await mkdir(OUT_DIR, { recursive: true })

	const rows: (Geometry | Readonly<{ imagePath: string; error: string }>)[] = []
	let index = 0
	for (const path of paths) {
		if (index >= limit) break
		index += 1
		const absolute = resolve(REPO_ROOT, path)
		if (!existsSync(absolute)) {
			rows.push({ imagePath: path, error: "missing-on-disk" })
			process.stderr.write(`[${index}/${paths.length}] ${path} MISSING\n`)
			continue
		}
		const started = Date.now()
		try {
			const { image, parse } = await runPipeline(absolute)
			const centroids = parse.groundChain.map((id) => [parse.nodes[id].centroidX, parse.nodes[id].centroidY] as const)
			const geometry = chainGeometry(centroids)
			const recomputed = geometry.length > 0 ? geometry.residual / geometry.length : null
			const check = recomputed === null || parse.laminarity === null ? (recomputed === parse.laminarity ? 0 : 1) : Math.abs(recomputed - parse.laminarity)
			const endsA = parse.nodes[parse.groundChain[0]]
			const endsB = parse.nodes[parse.groundChain[parse.groundChain.length - 1]]
			const endsDistinct =
				okLabDistance(rgbToOkLab(endsA.repr), rgbToOkLab(endsB.repr)) >= sameColorBar(colorFromRgb(endsA.repr), colorFromRgb(endsB.repr))
			const rootChildren = parse.nodes.filter((node) => node.parent === 0)
			rows.push({
				imagePath: path,
				membership: Array.from(membership.get(path) ?? []).sort(),
				width: image.width,
				height: image.height,
				coverage: parse.coverage,
				chainLength: parse.groundChain.length,
				laminarity: parse.laminarity,
				monotonicity: geometry.monotonicity,
				endsDistinct,
				fieldSiblings: rootChildren.filter((node) => node.areaFraction >= FIELD_AREA_FRACTION).length,
				endHexA: rgbToHex(endsA.repr),
				endHexB: rgbToHex(endsB.repr),
				currentVerdict: parse.verdict,
				currentGradient: parse.gradient,
				currentRoles: {
					background: rgbToHex(parse.roles.background),
					surface: rgbToHex(parse.roles.surface),
					foreground: rgbToHex(parse.roles.foreground),
					accent: rgbToHex(parse.roles.accent),
				},
				laminarityCheck: check,
			})
			process.stderr.write(`[${index}/${paths.length}] ${path} ${Date.now() - started}ms ${parse.verdict}\n`)
		} catch (error) {
			rows.push({ imagePath: path, error: String(error instanceof Error ? error.message : error) })
			process.stderr.write(`[${index}/${paths.length}] ${path} ERROR ${String(error)}\n`)
		}
	}

	await writeFile(resolve(OUT_DIR, "geometry.jsonl"), `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8")
	await writeFile(resolve(OUT_DIR, "labels.json"), `${JSON.stringify(labelSet, null, "\t")}\n`, "utf8")
	process.stderr.write(`wrote ${rows.length} geometry rows (${STUDY_VERSION})\n`)
}

await main()
