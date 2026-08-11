/**
 * Stage 1 of the coverage-gate sweep: extract, per cover, **everything `parseTree`'s verdict branch
 * and its field-pair branch read**, so the gate can be swept arithmetically instead of by re-running
 * the pipeline once per grid point.
 *
 *     NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *       research/v3/prototypes/p2-tree/tos/gate-sweep/collect.ts [--limit N]
 *
 * Run it through `pin.sh`, not directly, unless you want the working tree's pipeline.
 *
 * `parseTree`'s verdict depends on exactly: `coverage`, the ground chain's length, the chain's
 * `laminarity`, the chain's centroid *monotonicity*, whether the two chain ends are distinct under
 * the contract's bar, and how many field-sized siblings the root has. Of those only `monotonicity`
 * is not on the published `Parse`; `chainGeometry` below is **copied from
 * `tos/stability/q2-laminarity/collect.ts` (worker G, cycle 2)** rather than re-derived, and — as
 * there — its `laminarity` is checked against the parse's own value on every cover, which is what
 * makes the recomputation trustworthy rather than a second implementation nobody compared.
 *
 * This study additionally collects the **field pair each verdict class would publish** (pipeline.ts
 * lines 935-981): `laminar` takes the ground-chain ends under `ramPolarityAIsBackground`,
 * `partitioned` the two largest field siblings (or the two chain ends), `flat` the chain's far end
 * twice, and `textured`/`unreadable` share one fallback over the root's retained children. That last
 * fact is why the gate sweep cannot be read off verdict labels alone: an `unreadable` cover that
 * becomes `textured` publishes **the same two colours**, and one that becomes `flat`, `partitioned`
 * or `laminar` does not.
 *
 * The gradient labels come from `q2-laminarity/labels.ts`, imported (not re-derived) so this study's
 * 144 labelled covers are by construction the same 144 worker G measured.
 */

import { existsSync, readFileSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { colorFromRgb, okLabDistance, rgbToHex, rgbToOkLab, sameColorBar } from "../../../../src/contract/color.ts"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import { FIELD_AREA_FRACTION, RENDER_AXIS_UNIT } from "../constants.ts"
import { runPipeline } from "../pipeline.ts"
import { ramPolarityAIsBackground } from "../roles/indifference.ts"
import { loadGradientLabels } from "../stability/q2-laminarity/labels.ts"
import { DEMO_SET, FRESH_SET, STUDY_VERSION } from "./constants.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const P2_ROOT = resolve(HERE, "../..")
const V3_ROOT = resolve(HERE, "../../../..")
const REPO_ROOT = resolve(V3_ROOT, "../..")
const OUT_DIR = resolve(HERE, "out")

/** `pipeline.ts`'s `collinearityResidual`, copied from `q2-laminarity/collect.ts` so `monotonicity` is available. */
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

export type FieldPair = Readonly<{ background: string; surface: string }>

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
	/** The field pair each verdict class would publish for this cover. `textured` === `unreadable` by construction. */
	pairByVerdict: Readonly<Record<"laminar" | "partitioned" | "flat" | "textured" | "unreadable", FieldPair>>
	/** `|recomputed laminarity - parse.laminarity|`; a non-zero value invalidates the sweep. */
	laminarityCheck: number
}>

function readSet(file: string): string[] {
	return readFileSync(file, "utf8")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith("#"))
}

async function main(): Promise<void> {
	const limitFlag = process.argv.indexOf("--limit")
	const limit = limitFlag >= 0 ? Number(process.argv[limitFlag + 1]) : Number.POSITIVE_INFINITY

	const demo = readSet(resolve(V3_ROOT, DEMO_SET))
	const fresh = readSet(resolve(P2_ROOT, FRESH_SET))
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
	for (const path of fresh) add(path, "fresh-40")

	const paths = Array.from(membership.keys()).sort()
	await mkdir(OUT_DIR, { recursive: true })

	const rows: (Geometry | Readonly<{ imagePath: string; membership: readonly string[]; error: string }>)[] = []
	let index = 0
	for (const path of paths) {
		if (index >= limit) break
		index += 1
		const tags = Array.from(membership.get(path) ?? []).sort()
		const absolute = resolve(REPO_ROOT, path)
		if (!existsSync(absolute)) {
			rows.push({ imagePath: path, membership: tags, error: "missing-on-disk" })
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

			// ---- the field pair each verdict class would publish (pipeline.ts 935-981) ----------------
			const rootChildren = parse.nodes.filter((node) => node.parent === 0)
			const fieldSiblings = rootChildren.filter((node) => node.areaFraction >= FIELD_AREA_FRACTION)
			const byArea = (first: { areaFraction: number; id: number }, second: { areaFraction: number; id: number }): number =>
				second.areaFraction - first.areaFraction || first.id - second.id
			// **The twin collapse** (pipeline.ts 993-1001) runs after the field pair is chosen and before
			// anything is published: a `surface` inside `background`'s same-colour bar without being
			// exactly equal is the round-1 forbidden outcome, and the contract's sanctioned answer is to
			// assign the identical triple. Reconstructing the pair without it makes four covers'
			// "published" pair a fiction — the sweep's self-check caught exactly those four.
			const collapse = (background: Rgb8, surface: Rgb8): FieldPair => {
				const backgroundColor = colorFromRgb(background)
				const surfaceColor = colorFromRgb(surface)
				const collapsed =
					backgroundColor.hex !== surfaceColor.hex && okLabDistance(rgbToOkLab(background), rgbToOkLab(surface)) < sameColorBar(backgroundColor, surfaceColor)
				return { background: rgbToHex(background), surface: rgbToHex(collapsed ? background : surface) }
			}
			const polarity = ramPolarityAIsBackground({
				projectionA: endsA.centroidX * RENDER_AXIS_UNIT[0] + endsA.centroidY * RENDER_AXIS_UNIT[1],
				projectionB: endsB.centroidX * RENDER_AXIS_UNIT[0] + endsB.centroidY * RENDER_AXIS_UNIT[1],
				reprA: endsA.repr,
				reprB: endsB.repr,
				areaFractionA: endsA.areaFraction,
				areaFractionB: endsB.areaFraction,
			})
			const laminarPair = collapse(polarity.aIsBackground ? endsA.repr : endsB.repr, polarity.aIsBackground ? endsB.repr : endsA.repr)
			const partitionRanked = (fieldSiblings.length >= 2 ? fieldSiblings.slice() : [endsA, endsB]).sort(byArea)
			const partitionedPair = collapse(partitionRanked[0].repr, partitionRanked.length > 1 ? partitionRanked[1].repr : partitionRanked[0].repr)
			const flatPair = collapse(endsB.repr, endsB.repr)
			const fallback = rootChildren.slice().sort(byArea)
			const fallbackBackground = fallback.length > 0 ? fallback[0].repr : parse.nodes[0].repr
			const fallbackPair = collapse(fallbackBackground, fallback.length > 1 ? fallback[1].repr : fallbackBackground)

			rows.push({
				imagePath: path,
				membership: tags,
				width: image.width,
				height: image.height,
				coverage: parse.coverage,
				chainLength: parse.groundChain.length,
				laminarity: parse.laminarity,
				monotonicity: geometry.monotonicity,
				endsDistinct,
				fieldSiblings: fieldSiblings.length,
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
				pairByVerdict: {
					laminar: laminarPair,
					partitioned: partitionedPair,
					flat: flatPair,
					textured: fallbackPair,
					unreadable: fallbackPair,
				},
				laminarityCheck: check,
			})
			process.stderr.write(`[${index}/${paths.length}] ${path} ${Date.now() - started}ms ${parse.verdict} cov=${parse.coverage.toFixed(3)}\n`)
		} catch (error) {
			rows.push({ imagePath: path, membership: tags, error: String(error instanceof Error ? error.message : error) })
			process.stderr.write(`[${index}/${paths.length}] ${path} ERROR ${String(error)}\n`)
		}
	}

	await writeFile(resolve(OUT_DIR, "geometry.jsonl"), `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8")
	await writeFile(resolve(OUT_DIR, "labels.json"), `${JSON.stringify(labelSet, null, "\t")}\n`, "utf8")
	process.stderr.write(`wrote ${rows.length} geometry rows (${STUDY_VERSION})\n`)
}

await main()
