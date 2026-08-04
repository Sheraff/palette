/**
 * **Role provenance**: which retained node supplied each published role colour.
 *
 * `pipeline.ts` publishes rankings and winners but not *whose* colour won, and the cycle-2 question
 * ("did the winning node change identity even where the representatives held?") cannot be answered
 * without that. This module re-derives the role stage from the parse's own outputs — nodes,
 * ground chain, verdict, and the decoded image for the residual — and every derivation is checked
 * against `parse.roles` / `parse.foregroundPool` / `parse.accentPool` before it is used. A mismatch
 * throws; there is no "close enough" path.
 *
 * Nothing here is a second algorithm. It is `parseTree`'s role section read back with labels on.
 */

import { apcaRaw, colorFromRgb, okLabDistance, rgbToOkLab, rgbToHex, sameColorBar } from "../../../../../src/contract/color.ts"
import type { OkLab, Rgb8 } from "../../../../../src/contract/types.ts"
import { FIELD_AREA_FRACTION, MARK_NODE_LIMIT, MIN_NODE_AREA_FRACTION, RESIDUAL_POOL_SIZE } from "../../constants.ts"
import type { DecodedImage, Parse, ParsedNode } from "../../pipeline.ts"
import { unpack } from "../../pipeline.ts"

/** Where one published colour came from. `nodeId` indexes `parse.nodes`. */
export type ColorSource =
	| Readonly<{ kind: "node"; nodeId: number; why: string }>
	| Readonly<{ kind: "cluster"; nodeId: number; memberIds: readonly number[]; rank: number; why: string }>
	| Readonly<{ kind: "residual"; nodeId: null; rank: number; why: string }>

export type RoleSources = Readonly<{
	background: ColorSource
	surface: ColorSource
	/** Aligned with `parse.foregroundPool`, entry by entry. */
	foregroundPool: readonly ColorSource[]
	/** Aligned with `parse.accentPool`, entry by entry. */
	accentPool: readonly ColorSource[]
}>

const packOf = (rgb: Rgb8): number => (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]

export class TraceMismatch extends Error {
	override readonly name = "TraceMismatch"
}

/** `collinearityResidual`'s length + monotonicity, duplicated here only for the cluster ranking. */
function collinearity(points: readonly (readonly [number, number])[]): number {
	if (points.length < 2) return 1
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
	return length > 0 ? residual / length : 1
}

export function traceRoles(image: DecodedImage, parse: Parse): RoleSources {
	const nodes = parse.nodes
	const parsedChildren: number[][] = nodes.map(() => [])
	for (const node of nodes) if (node.parent >= 0) parsedChildren[node.parent].push(node.id)

	const endsA = nodes[parse.groundChain[0]]
	const endsB = nodes[parse.groundChain[parse.groundChain.length - 1]]
	const fieldSiblings = parsedChildren[0].filter((id) => nodes[id].areaFraction >= FIELD_AREA_FRACTION)

	// ---- background / surface, by verdict — `parseTree`'s branch table, with labels ----------------
	let backgroundNode: ParsedNode
	let surfaceNode: ParsedNode
	let why: string
	if (parse.verdict === "laminar") {
		// The RENDER_AXIS projection decides which end is stop 0; recovered from the published colour
		// rather than re-projected, because the parse already made the choice and this is a read-back.
		const aIsBackground = rgbToHex(endsA.repr) === rgbToHex(parse.roles.background)
		backgroundNode = aIsBackground ? endsA : endsB
		surfaceNode = aIsBackground ? endsB : endsA
		why = "laminar:chain-end"
	} else if (parse.verdict === "partitioned") {
		const ranked = (fieldSiblings.length >= 2 ? fieldSiblings.map((id) => nodes[id]) : [endsA, endsB]).slice()
		ranked.sort((first, second) => second.areaFraction - first.areaFraction || first.id - second.id)
		backgroundNode = ranked[0]
		surfaceNode = ranked.length > 1 ? ranked[1] : ranked[0]
		why = fieldSiblings.length >= 2 ? "partitioned:field-sibling" : "partitioned:chain-end"
	} else if (parse.verdict === "flat") {
		backgroundNode = endsB
		surfaceNode = endsB
		why = "flat:chain-tail"
	} else {
		const fallback = parsedChildren[0].map((id) => nodes[id]).slice()
		fallback.sort((first, second) => second.areaFraction - first.areaFraction || first.id - second.id)
		backgroundNode = fallback.length > 0 ? fallback[0] : nodes[0]
		surfaceNode = fallback.length > 1 ? fallback[1] : backgroundNode
		why = `${parse.verdict}:root-child-fallback`
	}
	if (rgbToHex(backgroundNode.repr) !== rgbToHex(parse.roles.background)) {
		throw new TraceMismatch(`background trace ${rgbToHex(backgroundNode.repr)} != parse ${rgbToHex(parse.roles.background)} (${parse.verdict})`)
	}
	if (rgbToHex(surfaceNode.repr) !== rgbToHex(parse.roles.surface)) {
		throw new TraceMismatch(`surface trace ${rgbToHex(surfaceNode.repr)} != parse ${rgbToHex(parse.roles.surface)} (${parse.verdict})`)
	}

	// ---- marks, clusters ---------------------------------------------------------------------------
	const chainSet = new Set(parse.groundChain)
	const marks = nodes
		.filter((node) => node.kind === "mark" && !chainSet.has(node.id))
		.sort((first, second) => second.areaFraction - first.areaFraction || first.id - second.id)
		.slice(0, MARK_NODE_LIMIT)

	const parentOf = marks.map((_unused, index) => index)
	const find = (index: number): number => {
		let root = index
		while (parentOf[root] !== root) root = parentOf[root]
		let walk = index
		while (parentOf[walk] !== root) {
			const next = parentOf[walk]
			parentOf[walk] = root
			walk = next
		}
		return root
	}
	for (let first = 0; first < marks.length; first += 1) {
		for (let second = first + 1; second < marks.length; second += 1) {
			const one = colorFromRgb(marks[first].repr)
			const other = colorFromRgb(marks[second].repr)
			if (okLabDistance(rgbToOkLab(marks[first].repr), rgbToOkLab(marks[second].repr)) < sameColorBar(one, other)) {
				const rootFirst = find(first)
				const rootSecond = find(second)
				if (rootFirst !== rootSecond) parentOf[Math.max(rootFirst, rootSecond)] = Math.min(rootFirst, rootSecond)
			}
		}
	}
	const clusterOf = new Map<number, number[]>()
	for (let index = 0; index < marks.length; index += 1) {
		const root = find(index)
		const bucket = clusterOf.get(root)
		if (bucket === undefined) clusterOf.set(root, [index])
		else bucket.push(index)
	}
	const clusters = Array.from(clusterOf.keys())
		.sort((first, second) => first - second)
		.map((root) => {
			const members = (clusterOf.get(root) ?? []).slice().sort((first, second) => first - second)
			const thicknesses = members.map((index) => marks[index].thinness).filter((value): value is number => value !== null)
			const thinness = thicknesses.length > 0 ? thicknesses.reduce((sum, value) => sum + value, 0) / thicknesses.length : 1
			const largest = members.slice().sort((first, second) => marks[second].areaFraction - marks[first].areaFraction || first - second)[0]
			return {
				members,
				thinness,
				count: members.length,
				collinearity: collinearity(members.map((index) => [marks[index].centroidX, marks[index].centroidY] as const)),
				areaFraction: members.reduce((sum, index) => sum + marks[index].areaFraction, 0),
				repr: marks[largest].repr,
				reprNodeId: marks[largest].id,
				memberIds: members.map((index) => marks[index].id),
				firstMarkId: marks[members[0]].id,
			}
		})
	clusters.sort(
		(first, second) =>
			first.thinness - second.thinness ||
			second.count - first.count ||
			first.collinearity - second.collinearity ||
			second.areaFraction - first.areaFraction ||
			first.firstMarkId - second.firstMarkId,
	)

	// ---- the residual ------------------------------------------------------------------------------
	const background = parse.roles.background
	const backgroundLab = rgbToOkLab(background)
	const chromaFromField = (color: Rgb8): number => {
		const lab = rgbToOkLab(color)
		return Math.hypot(lab[1] - backgroundLab[1], lab[2] - backgroundLab[2])
	}
	const lightnessMove = (color: Rgb8): number => Math.abs(rgbToOkLab(color)[0] - backgroundLab[0])

	const wholeImage = new Map<number, number>()
	for (let pixel = 0; pixel < image.packed.length; pixel += 1) {
		wholeImage.set(image.packed[pixel], (wholeImage.get(image.packed[pixel]) ?? 0) + 1)
	}
	const totalArea = image.width * image.height
	const areaFloor = Math.max(1, Math.ceil(MIN_NODE_AREA_FRACTION * totalArea))
	const commonEnough = Array.from(wholeImage.entries())
		.filter(([, count]) => count >= areaFloor)
		.map(([color]) => color)
	const residualPool = (commonEnough.length > 0 ? commonEnough : Array.from(wholeImage.keys()))
		.sort((first, second) => {
			const difference = Math.abs(apcaRaw(unpack(second), background)) - Math.abs(apcaRaw(unpack(first), background))
			return difference !== 0 ? difference : first - second
		})
		.slice(0, RESIDUAL_POOL_SIZE)
		.map(unpack)

	// ---- pools, with sources kept alongside through the dedupe --------------------------------------
	const dedupe = (colors: readonly Rgb8[], sources: readonly ColorSource[]): { colors: Rgb8[]; sources: ColorSource[] } => {
		const seen = new Set<number>()
		const keptColors: Rgb8[] = []
		const keptSources: ColorSource[] = []
		for (let index = 0; index < colors.length; index += 1) {
			const packed = packOf(colors[index])
			if (seen.has(packed)) continue
			seen.add(packed)
			keptColors.push(colors[index])
			keptSources.push(sources[index])
		}
		return { colors: keptColors, sources: keptSources }
	}
	const residualSources: ColorSource[] = residualPool.map((_unused, rank) => ({ kind: "residual", nodeId: null, rank, why: "residual:apca-rank" }))

	const foreground = dedupe(
		[...clusters.map((cluster) => cluster.repr), ...residualPool],
		[
			...clusters.map(
				(cluster, rank): ColorSource => ({ kind: "cluster", nodeId: cluster.reprNodeId, memberIds: cluster.memberIds, rank, why: "cluster:textness-rank" }),
			),
			...residualSources,
		],
	)

	const accentOrder = clusters
		.map((cluster, rank) => ({ cluster, rank }))
		.sort(
			(first, second) =>
				chromaFromField(second.cluster.repr) - chromaFromField(first.cluster.repr) ||
				lightnessMove(second.cluster.repr) - lightnessMove(first.cluster.repr) ||
				first.cluster.firstMarkId - second.cluster.firstMarkId,
		)
	const accent = dedupe(
		[...accentOrder.map((entry) => entry.cluster.repr), ...residualPool],
		[
			...accentOrder.map(
				(entry, rank): ColorSource => ({ kind: "cluster", nodeId: entry.cluster.reprNodeId, memberIds: entry.cluster.memberIds, rank, why: "cluster:chroma-rank" }),
			),
			...residualSources,
		],
	)

	const sameList = (derived: readonly Rgb8[], published: readonly Rgb8[], label: string): void => {
		if (derived.length !== published.length) throw new TraceMismatch(`${label} length ${derived.length} != ${published.length}`)
		for (let index = 0; index < derived.length; index += 1) {
			if (rgbToHex(derived[index]) !== rgbToHex(published[index])) {
				throw new TraceMismatch(`${label}[${index}] ${rgbToHex(derived[index])} != ${rgbToHex(published[index])}`)
			}
		}
	}
	sameList(foreground.colors, parse.foregroundPool, "foregroundPool")
	sameList(accent.colors, parse.accentPool, "accentPool")

	return {
		background: { kind: "node", nodeId: backgroundNode.id, why },
		surface: { kind: "node", nodeId: surfaceNode.id, why },
		foregroundPool: foreground.sources,
		accentPool: accent.sources,
	}
}

/** OKLab, for callers that want a node's colour without re-deriving the conversion. */
export function labOf(rgb: Rgb8): OkLab {
	return rgbToOkLab(rgb)
}
