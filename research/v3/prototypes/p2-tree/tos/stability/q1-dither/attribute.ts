/**
 * Stage 2 of the dither-churn localisation: match the two sides' node sets, and attribute every
 * published `dither-lsb1` disagreement to a pipeline stage.
 *
 *     NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *       research/v3/prototypes/p2-tree/tos/stability/q1-dither/attribute.ts
 *
 * ## The stages, and what each one means
 *
 * | tag | stage | the claim it makes |
 * |---|---|---|
 * | `a-node-set` | tree + stability filter | the node that supplied the colour exists on one side and has no counterpart on the other |
 * | `b-repr` | representative colour | the same region survived on both sides and its bar-density-mode representative moved beyond the contract's bar |
 * | `c-winner` | role assignment | both supplying nodes survived, their representatives held, and the *ranking* picked a different node |
 * | `d-residual` | residual pool | the colour did not come from a node at all — it is an image-wide exact triple ranked by APCA |
 * | `e-repair` | assembly walk | co-factor: `candidate.ts`'s repair walk moved the published colour off the parse's own first choice on at least one side |
 *
 * A cover carries every tag its disagreeing roles earn; the shares below therefore sum to more than
 * one, and the report prints the combinations as well as the marginals.
 *
 * ## What pins this to a commit
 *
 * The *published* palettes are read from `data/robustness/reports/p2-tos.json` — the artifact the
 * round-1 outcome quoted — not re-derived, so a sibling worker editing `candidate.ts` cannot move
 * the thing being explained. The *internals* come from `out/traces.jsonl`, which `collect.ts` wrote
 * from `pipeline.ts` at the recorded HEAD.
 */

import { readFileSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { colorFromHex, okLabDistance, rgbToOkLab, sameColorBar } from "../../../../../src/contract/color.ts"
import type { PaletteColor } from "../../../../../src/contract/types.ts"
import { wilsonInterval } from "../../../../../src/stats/index.ts"
import { MARK_NODE_LIMIT } from "../../constants.ts"
import { measurementState } from "../measurement-state.ts"
import { AREA_BINS, ARM, CANDIDATE, MATCH_SENSITIVITY_SETTINGS, STUDY_VERSION } from "./constants.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const V3_ROOT = resolve(HERE, "../../../../..")
const OUT_DIR = resolve(HERE, "out")

const ROLES = ["background", "surface", "foreground", "accent"] as const
type Role = (typeof ROLES)[number]

type Node = Readonly<{ id: number; parent: number; areaFraction: number; ownAreaFraction: number; cx: number; cy: number; depth: number; level: number; kind: string; repr: string }>
type Source = Readonly<{ kind: string; nodeId: number | null; rank?: number; why: string; memberIds?: readonly number[] }>
type Side = Readonly<{
	imagePath: string
	width: number
	height: number
	verdict: string
	coverage: number
	gradient: boolean
	groundChain: readonly number[]
	roles: Readonly<Record<Role, string>>
	roleNodes: Readonly<{ background: number; surface: number }>
	foregroundPool: readonly string[]
	accentPool: readonly string[]
	foregroundSources: readonly Source[]
	accentSources: readonly Source[]
	nodes: readonly Node[]
}>
type Trace = Readonly<{ artworkId: string; sourcePath: string; reviewedness: string; tier: string; left: Side; right: Side; error?: string }>

// ---------------------------------------------------------------------------------------------
// Node matching
// ---------------------------------------------------------------------------------------------

type Matching = Readonly<{ leftToRight: Int32Array; rightToLeft: Int32Array; matched: number }>

/**
 * Greedy minimum-cost matching under an area-ratio and a centroid gate.
 *
 * Deterministic: candidate pairs are sorted by (cost, left id, right id) and taken in that order, so
 * the result is a function of the two node tables and nothing else. A centroid grid at the gate's
 * own radius keeps the candidate generation near-linear on covers with thousands of nodes.
 */
function matchNodes(left: readonly Node[], right: readonly Node[], areaTolerance: number, centroidTolerance: number): Matching {
	const cell = centroidTolerance > 0 ? centroidTolerance : 1
	const grid = new Map<string, number[]>()
	for (let index = 0; index < right.length; index += 1) {
		const key = `${Math.floor(right[index].cx / cell)},${Math.floor(right[index].cy / cell)}`
		const bucket = grid.get(key)
		if (bucket === undefined) grid.set(key, [index])
		else bucket.push(index)
	}

	const pairs: { cost: number; left: number; right: number }[] = []
	for (let l = 0; l < left.length; l += 1) {
		const baseX = Math.floor(left[l].cx / cell)
		const baseY = Math.floor(left[l].cy / cell)
		for (let dx = -1; dx <= 1; dx += 1) {
			for (let dy = -1; dy <= 1; dy += 1) {
				const bucket = grid.get(`${baseX + dx},${baseY + dy}`)
				if (bucket === undefined) continue
				for (const r of bucket) {
					const distance = Math.hypot(left[l].cx - right[r].cx, left[l].cy - right[r].cy)
					if (distance > centroidTolerance) continue
					const bigger = Math.max(left[l].areaFraction, right[r].areaFraction)
					if (bigger === 0) continue
					const areaGap = Math.abs(left[l].areaFraction - right[r].areaFraction) / bigger
					if (areaGap > areaTolerance) continue
					pairs.push({ cost: areaGap + distance / (centroidTolerance || 1), left: l, right: r })
				}
			}
		}
	}
	pairs.sort((first, second) => first.cost - second.cost || first.left - second.left || first.right - second.right)

	const leftToRight = new Int32Array(left.length).fill(-1)
	const rightToLeft = new Int32Array(right.length).fill(-1)
	let matched = 0
	for (const pair of pairs) {
		if (leftToRight[pair.left] !== -1 || rightToLeft[pair.right] !== -1) continue
		leftToRight[pair.left] = pair.right
		rightToLeft[pair.right] = pair.left
		matched += 1
	}
	return { leftToRight, rightToLeft, matched }
}

// ---------------------------------------------------------------------------------------------
// Colour helpers — one ruler, the contract's
// ---------------------------------------------------------------------------------------------

const colorCache = new Map<string, PaletteColor>()
function colorOf(hex: string): PaletteColor {
	let color = colorCache.get(hex)
	if (color === undefined) {
		color = colorFromHex(hex)
		colorCache.set(hex, color)
	}
	return color
}
/** True when two hexes are the same colour by the contract's regional bar — the robustness harness's own test. */
function sameColor(first: string, second: string): boolean {
	if (first === second) return true
	const one = colorOf(first)
	const other = colorOf(second)
	return okLabDistance(rgbToOkLab(one.rgb), rgbToOkLab(other.rgb)) < sameColorBar(one, other)
}

// ---------------------------------------------------------------------------------------------
// Where a published colour came from
// ---------------------------------------------------------------------------------------------

type Attribution = Readonly<{ tag: string; nodeId: number | null; detail: string; poolRank: number | null; repaired: boolean }>

function sourceOfRole(side: Side, role: Role, publishedHex: string): Attribution {
	if (role === "background" || role === "surface") {
		return { tag: "node", nodeId: side.roleNodes[role], detail: `${side.verdict}:field-role`, poolRank: null, repaired: publishedHex !== side.roles[role] }
	}
	const pool = role === "foreground" ? side.foregroundPool : side.accentPool
	const sources = role === "foreground" ? side.foregroundSources : side.accentSources
	const index = pool.indexOf(publishedHex)
	if (index >= 0) {
		const source = sources[index]
		return { tag: source.kind, nodeId: source.nodeId, detail: source.why, poolRank: index, repaired: publishedHex !== side.roles[role] }
	}
	// Not in this role's pool: `candidate.ts` collapsed the accent onto the settled foreground.
	if (role === "accent") {
		const foregroundIndex = side.foregroundPool.indexOf(publishedHex)
		if (foregroundIndex >= 0) {
			const source = side.foregroundSources[foregroundIndex]
			return { tag: source.kind, nodeId: source.nodeId, detail: `collapsed-onto-foreground/${source.why}`, poolRank: foregroundIndex, repaired: true }
		}
	}
	return { tag: "unknown", nodeId: null, detail: "not-in-pool", poolRank: null, repaired: true }
}

/** The stage a role-level disagreement is charged to. */
function stageOf(
	leftSource: Attribution,
	rightSource: Attribution,
	left: Side,
	right: Side,
	matching: Matching,
): { stage: string; note: string } {
	if (leftSource.tag === "residual" || rightSource.tag === "residual") {
		return { stage: "d-residual", note: `${leftSource.tag}->${rightSource.tag}` }
	}
	if (leftSource.tag === "unknown" || rightSource.tag === "unknown" || leftSource.nodeId === null || rightSource.nodeId === null) {
		return { stage: "unknown", note: `${leftSource.detail}|${rightSource.detail}` }
	}
	const leftNode = leftSource.nodeId
	const rightNode = rightSource.nodeId
	const leftPartner = matching.leftToRight[leftNode]
	const rightPartner = matching.rightToLeft[rightNode]
	if (leftPartner === -1 || rightPartner === -1) {
		return { stage: "a-node-set", note: leftPartner === -1 && rightPartner === -1 ? "both-unmatched" : leftPartner === -1 ? "left-unmatched" : "right-unmatched" }
	}
	if (leftPartner === rightNode) {
		return { stage: "b-repr", note: `same-region repr ${left.nodes[leftNode].repr}->${right.nodes[rightNode].repr}` }
	}
	// Different regions won. Did the left winner's own counterpart hold its colour?
	const counterpartHeld = sameColor(left.nodes[leftNode].repr, right.nodes[leftPartner].repr)
	const otherHeld = sameColor(right.nodes[rightNode].repr, left.nodes[rightPartner].repr)
	return {
		stage: "c-winner",
		note: counterpartHeld && otherHeld ? "identity-swap, both reprs held" : "identity-swap, a repr also moved",
	}
}

// ---------------------------------------------------------------------------------------------

function rate(successes: number, trials: number): Readonly<{ successes: number; trials: number; rate: number | null; interval: readonly [number, number] | null }> {
	if (trials === 0) return { successes, trials, rate: null, interval: null }
	const wilson = wilsonInterval(successes, trials)
	return {
		successes,
		trials,
		rate: successes / trials,
		interval: "low" in wilson ? ([wilson.low, wilson.high] as const) : null,
	}
}

async function main(): Promise<void> {
	const traces = readFileSync(resolve(OUT_DIR, "traces.jsonl"), "utf8")
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as Trace)
	const ok = traces.filter((trace) => trace.error === undefined)

	const reportPath = resolve(V3_ROOT, `data/robustness/reports/${CANDIDATE}.json`)
	const robustness = JSON.parse(readFileSync(reportPath, "utf8")) as {
		byPairType: { group: string; agreed: number; compared: number }[]
		disagreements: {
			arm: string | null
			artworkId: string
			comparison: { comparisons: { role: Role; left: string; right: string; same: boolean }[]; disagreeingRoles: Role[]; worstRoleBarRatio: number }
		}[]
	}
	const failures = new Map(robustness.disagreements.filter((entry) => entry.arm === ARM).map((entry) => [entry.artworkId, entry]))

	// ---- per-setting node-set + representative churn over ALL covers ------------------------------
	const settingSummaries: unknown[] = []
	const matchingsByCover = new Map<string, Matching>()
	for (const setting of MATCH_SENSITIVITY_SETTINGS) {
		let leftNodes = 0
		let rightNodes = 0
		let matchedTotal = 0
		let reprMoved = 0
		const binMoved = AREA_BINS.map(() => 0)
		const binTotal = AREA_BINS.map(() => 0)
		const kindMoved = { field: 0, mark: 0 }
		const kindTotal = { field: 0, mark: 0 }
		for (const trace of ok) {
			const matching = matchNodes(trace.left.nodes, trace.right.nodes, setting.areaRatio, setting.centroid)
			if (setting.name === "default") matchingsByCover.set(trace.artworkId, matching)
			leftNodes += trace.left.nodes.length
			rightNodes += trace.right.nodes.length
			matchedTotal += matching.matched
			for (let l = 0; l < trace.left.nodes.length; l += 1) {
				const r = matching.leftToRight[l]
				if (r === -1) continue
				const moved = !sameColor(trace.left.nodes[l].repr, trace.right.nodes[r].repr)
				if (moved) reprMoved += 1
				const area = trace.left.nodes[l].areaFraction
				const bin = AREA_BINS.findIndex((edge) => area < edge)
				const slot = bin === -1 ? AREA_BINS.length - 1 : bin
				binTotal[slot] += 1
				if (moved) binMoved[slot] += 1
				const kind = trace.left.nodes[l].kind === "field" ? "field" : "mark"
				kindTotal[kind] += 1
				if (moved) kindMoved[kind] += 1
			}
		}
		settingSummaries.push({
			setting,
			nodes: { left: leftNodes, right: rightNodes, matched: matchedTotal },
			unmatchedLeft: rate(leftNodes - matchedTotal, leftNodes),
			unmatchedRight: rate(rightNodes - matchedTotal, rightNodes),
			jaccard: matchedTotal / (leftNodes + rightNodes - matchedTotal),
			reprMovedAmongMatched: rate(reprMoved, matchedTotal),
			byAreaBin: AREA_BINS.map((edge, slot) => ({ areaFractionBelow: edge, ...rate(binMoved[slot], binTotal[slot]) })),
			byKind: { field: rate(kindMoved.field, kindTotal.field), mark: rate(kindMoved.mark, kindTotal.mark) },
		})
	}

	// ---- stage-c: did the role-supplying node change identity, over ALL covers --------------------
	const winnerChanged: Record<string, { changed: number; total: number }> = {}
	const parseRoleMoved: Record<string, { changed: number; total: number }> = {}
	const verdictChanged = { changed: 0, total: 0 }
	for (const trace of ok) {
		const matching = matchingsByCover.get(trace.artworkId)!
		verdictChanged.total += 1
		if (trace.left.verdict !== trace.right.verdict) verdictChanged.changed += 1
		for (const role of ROLES) {
			const leftSource = sourceOfRole(trace.left, role, trace.left.roles[role])
			const rightSource = sourceOfRole(trace.right, role, trace.right.roles[role])
			winnerChanged[role] ??= { changed: 0, total: 0 }
			parseRoleMoved[role] ??= { changed: 0, total: 0 }
			parseRoleMoved[role].total += 1
			if (!sameColor(trace.left.roles[role], trace.right.roles[role])) parseRoleMoved[role].changed += 1
			if (leftSource.nodeId === null || rightSource.nodeId === null) continue
			winnerChanged[role].total += 1
			const partner = matching.leftToRight[leftSource.nodeId]
			if (partner !== rightSource.nodeId) winnerChanged[role].changed += 1
		}
	}

	// ---- where in the role stage the identity swap is decided --------------------------------------
	//
	// `parseTree` reaches the foreground/accent rankings through two truncations and a clustering:
	// the ground chain (which marks are excluded), `MARK_NODE_LIMIT` (which marks are even looked at),
	// and the same-colour union-find over mark representatives. Each is measured separately, over all
	// 100 covers, so "the role stage churns" can be charged to a specific mechanism.
	const markSet = { survived: 0, total: 0 }
	const chainMembership = { survived: 0, total: 0 }
	const chainLength = { changed: 0, total: 0 }
	const kindFlip = { changed: 0, total: 0 }
	for (const trace of ok) {
		const matching = matchingsByCover.get(trace.artworkId)!
		const topMarks = (side: Side): number[] => {
			const chain = new Set(side.groundChain)
			return side.nodes
				.filter((node) => node.kind === "mark" && !chain.has(node.id))
				.sort((first, second) => second.areaFraction - first.areaFraction || first.id - second.id)
				.slice(0, MARK_NODE_LIMIT)
				.map((node) => node.id)
		}
		const leftMarks = topMarks(trace.left)
		const rightMarks = new Set(topMarks(trace.right))
		for (const id of leftMarks) {
			markSet.total += 1
			const partner = matching.leftToRight[id]
			if (partner !== -1 && rightMarks.has(partner)) markSet.survived += 1
		}
		const rightChain = new Set(trace.right.groundChain)
		for (const id of trace.left.groundChain) {
			chainMembership.total += 1
			const partner = matching.leftToRight[id]
			if (partner !== -1 && rightChain.has(partner)) chainMembership.survived += 1
		}
		chainLength.total += 1
		if (trace.left.groundChain.length !== trace.right.groundChain.length) chainLength.changed += 1
		for (let l = 0; l < trace.left.nodes.length; l += 1) {
			const r = matching.leftToRight[l]
			if (r === -1) continue
			kindFlip.total += 1
			if (trace.left.nodes[l].kind !== trace.right.nodes[r].kind) kindFlip.changed += 1
		}
	}

	// ---- attribution of the published failures ----------------------------------------------------
	const perFailure: unknown[] = []
	const stageShare = new Map<string, number>()
	const stageByRole = new Map<string, Map<string, number>>()
	const combinationShare = new Map<string, number>()
	let repairInvolved = 0
	for (const trace of ok) {
		const failure = failures.get(trace.artworkId)
		if (failure === undefined) continue
		const matching = matchingsByCover.get(trace.artworkId)!
		const roleRows: unknown[] = []
		const tags = new Set<string>()
		let repaired = false
		for (const role of failure.comparison.disagreeingRoles) {
			const published = failure.comparison.comparisons.find((entry) => entry.role === role)!
			const leftSource = sourceOfRole(trace.left, role, published.left)
			const rightSource = sourceOfRole(trace.right, role, published.right)
			const { stage, note } = stageOf(leftSource, rightSource, trace.left, trace.right, matching)
			tags.add(stage)
			if (leftSource.repaired || rightSource.repaired) {
				repaired = true
				tags.add("e-repair")
			}
			const bucket = stageByRole.get(stage) ?? new Map<string, number>()
			bucket.set(role, (bucket.get(role) ?? 0) + 1)
			stageByRole.set(stage, bucket)
			roleRows.push({
				role,
				left: published.left,
				right: published.right,
				leftSource,
				rightSource,
				stage,
				note,
				repaired: leftSource.repaired || rightSource.repaired,
			})
		}
		if (repaired) repairInvolved += 1
		for (const tag of tags) stageShare.set(tag, (stageShare.get(tag) ?? 0) + 1)
		const combination = Array.from(tags).sort().join("+")
		combinationShare.set(combination, (combinationShare.get(combination) ?? 0) + 1)
		perFailure.push({
			artworkId: trace.artworkId,
			sourcePath: trace.sourcePath,
			reviewedness: trace.reviewedness,
			verdict: { left: trace.left.verdict, right: trace.right.verdict },
			nodes: { left: trace.left.nodes.length, right: trace.right.nodes.length, matched: matching.matched },
			worstRoleBarRatio: failure.comparison.worstRoleBarRatio,
			stages: Array.from(tags).sort(),
			roles: roleRows,
		})
	}

	const failureCount = perFailure.length
	const report = {
		what: "Where the p2-tos dither-lsb1 churn lives: every published disagreement charged to a pipeline stage.",
		studyVersion: STUDY_VERSION,
		candidate: CANDIDATE,
		arm: ARM,
		measurementState: measurementState(),
		inputs: {
			traces: "research/v3/prototypes/p2-tree/tos/stability/q1-dither/out/traces.jsonl",
			robustnessReport: `research/v3/data/robustness/reports/${CANDIDATE}.json`,
			perturbationSet: "research/v3/data/robustness/perturbation-set-1.json",
		},
		correction: {
			briefSaid: "34 covers where p2-tos disagreed under dither-lsb1",
			measured:
				"34 is the AGREEMENT count in byPairType.dither-lsb1 (agreed 34 / compared 100). The disagreements list holds 66 dither-lsb1 covers, and those 66 are what this study attributes.",
			byPairType: robustness.byPairType.find((entry) => entry.group === ARM),
		},
		covers: { traced: ok.length, failing: failureCount, agreeing: ok.length - failureCount },
		nodeMatching: settingSummaries,
		perStageRatesOverAllCovers: {
			verdictChanged: rate(verdictChanged.changed, verdictChanged.total),
			parseLevelRoleMoved: Object.fromEntries(ROLES.map((role) => [role, rate(parseRoleMoved[role].changed, parseRoleMoved[role].total)])),
			roleSupplyingNodeIdentityChanged: Object.fromEntries(ROLES.map((role) => [role, rate(winnerChanged[role].changed, winnerChanged[role].total)])),
			roleStageMechanisms: {
				markNodeLimitSurvival: {
					constant: "MARK_NODE_LIMIT",
					value: MARK_NODE_LIMIT,
					note: "share of the left side's top-MARK_NODE_LIMIT marks whose matched counterpart is also inside the right side's top-MARK_NODE_LIMIT — the truncation's own churn",
					...rate(markSet.survived, markSet.total),
				},
				groundChainMembershipSurvival: {
					note: "share of the left ground chain's nodes whose counterpart is on the right ground chain — decides which nodes are excluded from the mark population",
					...rate(chainMembership.survived, chainMembership.total),
				},
				groundChainLengthChanged: rate(chainLength.changed, chainLength.total),
				fieldMarkClassFlip: {
					constant: "FIELD_AREA_FRACTION",
					note: "matched nodes that cross the field/mark boundary between the two sides",
					...rate(kindFlip.changed, kindFlip.total),
				},
			},
		},
		attribution: {
			denominator: failureCount,
			marginalShares: Object.fromEntries(
				Array.from(stageShare.entries())
					.sort((first, second) => second[1] - first[1] || (first[0] < second[0] ? -1 : 1))
					.map(([stage, count]) => [stage, { covers: count, share: count / failureCount }]),
			),
			combinations: Object.fromEntries(
				Array.from(combinationShare.entries())
					.sort((first, second) => second[1] - first[1] || (first[0] < second[0] ? -1 : 1))
					.map(([combination, count]) => [combination, { covers: count, share: count / failureCount }]),
			),
			roleLevelStageCounts: Object.fromEntries(
				Array.from(stageByRole.entries())
					.sort((first, second) => (first[0] < second[0] ? -1 : 1))
					.map(([stage, roles]) => [stage, Object.fromEntries(Array.from(roles.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1)))]),
			),
			repairWalkInvolved: rate(repairInvolved, failureCount),
		},
		failures: perFailure,
	}

	await mkdir(OUT_DIR, { recursive: true })
	await writeFile(resolve(HERE, "report.json"), `${JSON.stringify(report, null, "\t")}\n`, "utf8")
	process.stdout.write(`${JSON.stringify({ ...report, failures: `${failureCount} rows (see report.json)` }, null, "\t")}\n`)
}

await main()
