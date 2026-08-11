/**
 * **MEASUREMENT A of substrate cycle 2** — the coupling claim, run before any code is touched.
 *
 * `SUBSTRATE_2_PREREG.md` §"Measurement A": on the full 200-pair rendition set (both sides) and a
 * 50-cover dither/q92 perturbation sample, the **field's summary statistic drift** as a median
 * |log ratio|, cross-rendition vs same-resolution perturbation, for **both** substrates. The claim
 * is confirmed iff the coherence field's cross-rendition drift is (i) ≤ half the binary field's and
 * (ii) not materially above its own perturbation drift.
 *
 * ## The statistics, named before they are read
 *
 * Two per substrate, exactly the two the prereg names:
 *
 * - **F-membership fraction** — `|F| / |eligible|`. On the binary path F is the top (1 − β) of the
 *   EDT depth (or the degenerate-depth fallback); on the coherence path it is the top (1 − β) of the
 *   coherence percentile. *The coherence path's value is (1 − β) by construction* (SUBSTRATE.md §8),
 *   so its drift is expected to be ~0 for an arithmetic reason and not an empirical one. It is
 *   measured anyway because the prereg names it, and it is reported with that caveat attached.
 * - **The e₁-relevant ordering** — e₁ is the cascade pixel of the band of F whose far edge sits at
 *   the (1 − τ) rank of *distance from F's cascade median* (`field-roles.ts:chooseFieldEnds` step 2).
 *   The scalar that places that band is the (1 − τ) quantile of that distance distribution, so that
 *   is the summary read here (`e1Q95`), with the median of the same ordering (`e1Q50`) reported
 *   beside it so the headline cannot be a single-quantile artefact.
 *
 * Two more travel with every row as **instrument validation against numbers this campaign already
 * published**, never as the verdict: the binary edge fraction (`PAIRS_ATTRIBUTION.md` §8 measured a
 * median |log ratio| of 0.122 across pairs and 0.058 across perturbations) and the β-quantile depth
 * in fraction form (§5 measured 0.34 across pairs and 0.32 across perturbations). If this file's
 * control column does not land near those, the instrument is wrong and nothing else in it counts.
 *
 * ## Nothing here is on the shipped path
 *
 * This file only *reads* `src/`. It imports the same functions the pipeline calls, at the same
 * constants, and computes no palette. It writes only under `measurements/substrate/`.
 *
 * ## Usage
 *
 *   # 1 — build the task plan (materialises the perturbation arms into the harness cache)
 *   node --experimental-strip-types field-drift.ts plan --out field-drift-plan.json
 *   # 2 — compute the summaries, sharded across processes (CPU-bound, one image at a time each)
 *   node --experimental-strip-types field-drift.ts compute --plan … --shard 0/6 --out …-s0.jsonl
 *   # 3 — aggregate every shard into the drift table
 *   node --experimental-strip-types field-drift.ts report --plan … --summaries "…-s*.jsonl"
 */

import { readFile, writeFile, appendFile, rm } from "node:fs/promises"
import path from "node:path"
import { parseArgs } from "node:util"

import { TRIM_LEVEL } from "../../src/constants.ts"
import { decodeImage } from "../../src/decode.ts"
import type { DecodedImage } from "../../src/decode.ts"
import { computeCoherenceField } from "../../src/coherence.ts"
import { computeDepthField, computeEdgeField } from "../../src/fields.ts"
import { computeCoherenceFieldSet, computeFieldSet } from "../../src/field-roles.ts"
import { cascadePixel, labDistance, quantileIndex, sortByKey } from "../../src/primitives.ts"
import { materializeArm, armByName } from "../../../../src/robustness/perturb.ts"
import type { PairSetFile, PerturbationSetFile } from "../../../../src/robustness/types.ts"

const HERE = import.meta.dirname
const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..", "..", "..")
const V3_ROOT = path.resolve(REPO_ROOT, "research", "v3")
const PAIR_SET = path.join(V3_ROOT, "data", "robustness", "pair-set-1.json")
const PERTURBATION_SET = path.join(V3_ROOT, "data", "robustness", "perturbation-set-1.json")
const CACHE_DIR = path.join(V3_ROOT, "data", "robustness", "cache")

/**
 * `[HELD]` — the prereg's own sample size for the same-resolution control ("a 50-cover dither/q92
 * perturbation sample"). The 50 are the **first 50 covers in the frozen set file's own order**,
 * which is already a seeded stratified draw (`perturbation-set.ts`), so this is a prefix of a
 * random sample and not a second draw with a second seed.
 */
const PERTURBATION_COVERS = 50

/** The two arms the prereg names. The other two JPEG qualities are not in this measurement. */
const PERTURBATION_ARMS = ["dither-lsb1", "jpeg-q92"] as const

type Task = Readonly<{
	group: "pair" | "perturb"
	/** Pair id, or `artworkId|arm`. */
	key: string
	arm: string | null
	/** `a`/`b` for a pair, `baseline`/`perturbed` for a perturbation. */
	side: string
	/** Absolute path to the image file. */
	file: string
}>

type SubstrateSummary = Readonly<{
	fFraction: number
	threshold: number
	e1Q95: number
	e1Q50: number
	fieldSetSize: number
	rule: string
}>

type Summary = Readonly<{
	file: string
	width: number
	height: number
	longEdge: number
	eligible: number
	/** Instrument validation only — `PAIRS_ATTRIBUTION.md` §8's quantity. */
	edgeFraction: number
	binary: SubstrateSummary
	coherence: SubstrateSummary
	radii: readonly number[]
	millis: number
}>

// ---------------------------------------------------------------------------
// The two statistics
// ---------------------------------------------------------------------------

/**
 * The e₁-relevant ordering's quantiles: distance in OKLab from F's cascade median, at the (1 − τ)
 * rank that places e₁'s band and at the median rank.
 *
 * This is `chooseFieldEnds` steps 1–2 with the band read as a number instead of a pixel — the same
 * median primitive, the same key, the same `quantileIndex`.
 */
function orderingQuantiles(image: DecodedImage, indices: Int32Array): { q95: number; q50: number } {
	const n = indices.length
	if (n === 0) return { q95: 0, q50: 0 }
	const median = cascadePixel(indices, n, image.lab, image.rgb)
	const key = (index: number): number => labDistance(image.lab, index, median)
	const byDistance = sortByKey(indices, key)
	return {
		q95: key(byDistance[quantileIndex(n, 1 - TRIM_LEVEL)]),
		q50: key(byDistance[quantileIndex(n, 0.5)]),
	}
}

async function summarize(file: string): Promise<Summary> {
	const started = Date.now()
	const image = await decodeImage(file)
	const eligible = Math.max(1, image.eligibleIndices.length)

	// --- the binary edge/EDT substrate, exactly as `pipeline.ts` builds it with the flag unset ---
	const edges = computeEdgeField(image)
	const depth = computeDepthField(image, edges)
	const binaryField = computeFieldSet(image, depth)
	const binaryOrdering = orderingQuantiles(image, binaryField.indices)

	// --- the coherence substrate, exactly as `pipeline.ts` builds it with `P3_SUBSTRATE=field` ---
	const coherence = computeCoherenceField(image)
	const coherenceField = computeCoherenceFieldSet(image, coherence.coherence)
	const coherenceOrdering = orderingQuantiles(image, coherenceField.indices)

	return {
		file: path.relative(REPO_ROOT, file),
		width: image.width,
		height: image.height,
		longEdge: image.longEdge,
		eligible: image.eligibleIndices.length,
		edgeFraction: edges.edgeCount / eligible,
		binary: {
			fFraction: binaryField.indices.length / eligible,
			threshold: binaryField.threshold,
			e1Q95: binaryOrdering.q95,
			e1Q50: binaryOrdering.q50,
			fieldSetSize: binaryField.indices.length,
			rule: binaryField.rule,
		},
		coherence: {
			fFraction: coherenceField.indices.length / eligible,
			threshold: coherenceField.threshold,
			e1Q95: coherenceOrdering.q95,
			e1Q50: coherenceOrdering.q50,
			fieldSetSize: coherenceField.indices.length,
			rule: coherenceField.rule,
		},
		radii: coherence.radii,
		millis: Date.now() - started,
	}
}

// ---------------------------------------------------------------------------
// plan
// ---------------------------------------------------------------------------

async function buildPlan(outPath: string): Promise<void> {
	const pairSet = JSON.parse(await readFile(PAIR_SET, "utf8")) as PairSetFile
	const perturbationSet = JSON.parse(await readFile(PERTURBATION_SET, "utf8")) as PerturbationSetFile

	const tasks: Task[] = []
	for (const pair of pairSet.pairs) {
		tasks.push({ group: "pair", key: pair.pairId, arm: null, side: "a", file: path.join(REPO_ROOT, pair.a.path) })
		tasks.push({ group: "pair", key: pair.pairId, arm: null, side: "b", file: path.join(REPO_ROOT, pair.b.path) })
	}

	const covers = perturbationSet.covers.slice(0, PERTURBATION_COVERS)
	for (const cover of covers) {
		const source = path.join(REPO_ROOT, cover.path)
		for (const armName of PERTURBATION_ARMS) {
			const arm = armByName(armName)
			const materialized = await materializeArm(source, cover.sha256, arm, CACHE_DIR)
			tasks.push({
				group: "perturb",
				key: `${cover.artworkId}|${armName}`,
				arm: armName,
				side: "baseline",
				file: materialized.baselinePath,
			})
			tasks.push({
				group: "perturb",
				key: `${cover.artworkId}|${armName}`,
				arm: armName,
				side: "perturbed",
				file: materialized.perturbedPath,
			})
		}
	}

	const files = [...new Set(tasks.map((task) => task.file))].sort()
	await writeFile(
		outPath,
		`${JSON.stringify(
			{
				what: "MEASUREMENT A task plan — SUBSTRATE_2_PREREG.md",
				writtenAt: new Date().toISOString(),
				pairSet: { path: path.relative(REPO_ROOT, PAIR_SET), setId: pairSet.setId, pairs: pairSet.pairs.length },
				perturbationSet: {
					path: path.relative(REPO_ROOT, PERTURBATION_SET),
					setId: perturbationSet.setId,
					coversInFile: perturbationSet.covers.length,
					coversUsed: covers.length,
					arms: PERTURBATION_ARMS,
				},
				counts: { tasks: tasks.length, distinctFiles: files.length },
				tasks,
				files,
			},
			null,
			2,
		)}\n`,
	)
	console.log(`plan: ${tasks.length} tasks over ${files.length} distinct files → ${outPath}`)
}

// ---------------------------------------------------------------------------
// compute
// ---------------------------------------------------------------------------

type Plan = { files: string[]; tasks: Task[] }

async function compute(planPath: string, shard: string, outPath: string): Promise<void> {
	const plan = JSON.parse(await readFile(planPath, "utf8")) as Plan
	const [indexRaw, ofRaw] = shard.split("/")
	const index = Number(indexRaw)
	const of = Number(ofRaw)
	await rm(outPath, { force: true })
	let done = 0
	for (let i = index; i < plan.files.length; i += of) {
		const file = plan.files[i]
		try {
			const summary = await summarize(file)
			await appendFile(outPath, `${JSON.stringify(summary)}\n`)
		} catch (error) {
			await appendFile(
				outPath,
				`${JSON.stringify({ file: path.relative(REPO_ROOT, file), error: String(error) })}\n`,
			)
		}
		done += 1
		if (done % 10 === 0) console.log(`shard ${index}/${of}: ${done} files`)
	}
	console.log(`shard ${index}/${of}: done, ${done} files → ${outPath}`)
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

function median(values: number[]): number {
	if (values.length === 0) return Number.NaN
	const sorted = [...values].sort((a, b) => a - b)
	const middle = sorted.length >> 1
	return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function quantile(values: number[], q: number): number {
	if (values.length === 0) return Number.NaN
	const sorted = [...values].sort((a, b) => a - b)
	return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]
}

type Stat = (summary: Summary) => number

const STATS: readonly (readonly [string, Stat])[] = [
	["binary.fFraction", (s) => s.binary.fFraction],
	["binary.e1Q95", (s) => s.binary.e1Q95],
	["binary.e1Q50", (s) => s.binary.e1Q50],
	["binary.betaDepth", (s) => s.binary.threshold],
	["binary.edgeFraction", (s) => s.edgeFraction],
	["coherence.fFraction", (s) => s.coherence.fFraction],
	["coherence.e1Q95", (s) => s.coherence.e1Q95],
	["coherence.e1Q50", (s) => s.coherence.e1Q50],
]

async function report(planPath: string, summaryPaths: string[], outPath: string | undefined): Promise<void> {
	const plan = JSON.parse(await readFile(planPath, "utf8")) as Plan
	const byFile = new Map<string, Summary>()
	let errors = 0
	for (const summaryPath of summaryPaths) {
		const text = await readFile(summaryPath, "utf8")
		for (const line of text.split("\n")) {
			if (line.trim().length === 0) continue
			const row = JSON.parse(line) as Summary & { error?: string }
			if (row.error !== undefined) {
				errors += 1
				console.log(`ERROR ${row.file}: ${row.error}`)
				continue
			}
			byFile.set(row.file, row)
		}
	}

	// Group the tasks into two-sided comparisons.
	type Comparison = { group: string; key: string; arm: string | null; left: Summary; right: Summary }
	const comparisons: Comparison[] = []
	const grouped = new Map<string, Task[]>()
	for (const task of plan.tasks) {
		const id = `${task.group}|${task.key}`
		const list = grouped.get(id) ?? []
		list.push(task)
		grouped.set(id, list)
	}
	let incomplete = 0
	for (const [id, list] of grouped) {
		if (list.length !== 2) {
			incomplete += 1
			continue
		}
		const left = byFile.get(path.relative(REPO_ROOT, list[0].file))
		const right = byFile.get(path.relative(REPO_ROOT, list[1].file))
		if (left === undefined || right === undefined) {
			incomplete += 1
			continue
		}
		comparisons.push({ group: list[0].group, key: id, arm: list[0].arm, left, right })
	}

	const pairs = comparisons.filter((c) => c.group === "pair")
	const perturbations = comparisons.filter((c) => c.group === "perturb")
	const sameResolution = pairs.filter((c) => c.left.longEdge === c.right.longEdge)

	console.log(`\nsummaries ${byFile.size}/${plan.files.length} files, ${errors} errors, ${incomplete} incomplete comparisons`)
	console.log(`comparisons: ${pairs.length} pairs (${sameResolution.length} same-resolution), ${perturbations.length} perturbation`)

	const table: Record<string, unknown> = {}
	const line = (label: string, cells: string[]): void => console.log(`${label.padEnd(24)}${cells.join("")}`)
	line("statistic", ["  pairs n | med|logR| |    p90 |", "  perturb n | med|logR| |    p90 |"])
	for (const [name, stat] of STATS) {
		const logRatios = (set: Comparison[]): number[] => {
			const out: number[] = []
			for (const comparison of set) {
				const a = stat(comparison.left)
				const b = stat(comparison.right)
				if (!(a > 0) || !(b > 0) || !Number.isFinite(a) || !Number.isFinite(b)) continue
				out.push(Math.abs(Math.log(a / b)))
			}
			return out
		}
		const pairLog = logRatios(pairs)
		const perturbLog = logRatios(perturbations)
		table[name] = {
			pairs: { n: pairLog.length, median: median(pairLog), p90: quantile(pairLog, 0.9) },
			perturbations: { n: perturbLog.length, median: median(perturbLog), p90: quantile(perturbLog, 0.9) },
		}
		line(name, [
			`  ${String(pairLog.length).padStart(7)} | ${median(pairLog).toFixed(4).padStart(9)} | ${quantile(pairLog, 0.9).toFixed(4).padStart(6)} |`,
			`  ${String(perturbLog.length).padStart(9)} | ${median(perturbLog).toFixed(4).padStart(9)} | ${quantile(perturbLog, 0.9).toFixed(4).padStart(6)} |`,
		])
	}

	// Per-arm split of the perturbation column, so the dither and q92 halves are separable.
	console.log("")
	for (const armName of PERTURBATION_ARMS) {
		const armSet = perturbations.filter((c) => c.arm === armName)
		const cells: string[] = []
		for (const [name, stat] of STATS) {
			const out: number[] = []
			for (const comparison of armSet) {
				const a = stat(comparison.left)
				const b = stat(comparison.right)
				if (!(a > 0) || !(b > 0)) continue
				out.push(Math.abs(Math.log(a / b)))
			}
			cells.push(`${name}=${median(out).toFixed(4)}`)
		}
		console.log(`${armName} (n=${armSet.length}): ${cells.join("  ")}`)
	}

	// ---------------------------------------------------------------------------------------
	// Like-for-like: the e₁ statistic is undefined (0) when F is one exact colour, and the two
	// substrates do not go flat on the same covers, so the two columns above are computed over
	// slightly different row sets. This block re-computes them over the rows where **all four**
	// values (both substrates, both sides) are positive, so the comparison is paired.
	// ---------------------------------------------------------------------------------------
	console.log("\n--- paired common subset (both substrates non-degenerate on both sides) ---")
	const commonTable: Record<string, unknown> = {}
	for (const [label, set] of [["pairs", pairs], ["perturbations", perturbations]] as const) {
		const common = set.filter(
			(c) =>
				c.left.binary.e1Q95 > 0 && c.right.binary.e1Q95 > 0 &&
				c.left.coherence.e1Q95 > 0 && c.right.coherence.e1Q95 > 0,
		)
		const binaryLog = common.map((c) => Math.abs(Math.log(c.left.binary.e1Q95 / c.right.binary.e1Q95)))
		const coherenceLog = common.map((c) => Math.abs(Math.log(c.left.coherence.e1Q95 / c.right.coherence.e1Q95)))
		const improved = common.filter((_, i) => coherenceLog[i] < binaryLog[i]).length
		commonTable[label] = {
			n: common.length,
			binaryMedian: median(binaryLog),
			coherenceMedian: median(coherenceLog),
			coherenceRowsSmaller: improved,
		}
		console.log(
			`${label.padEnd(14)} n=${String(common.length).padStart(4)}  binary e1Q95 ${median(binaryLog).toFixed(4)}  ` +
				`coherence e1Q95 ${median(coherenceLog).toFixed(4)}  (coherence smaller on ${improved}/${common.length} rows)`,
		)
	}

	// ---------------------------------------------------------------------------------------
	// The mechanism's own claim is about **resolution**: scale-relative radii are supposed to buy
	// invariance where a fixed 8-neighbourhood cannot. 29 of the 200 pairs are same-resolution, so
	// the resolution-differing 171 are where the claim has to show, and the same-resolution 29 are
	// a within-pair control. `radiiDiffer` is line tension 1 of `coherence.ts` made countable:
	// `Math.round` can land two renditions 20 % apart on the same integer radius triple.
	// ---------------------------------------------------------------------------------------
	console.log("\n--- cross-rendition, split by resolution (e1Q95) ---")
	const resolutionSplit: Record<string, unknown> = {}
	const sameRadii = (c: Comparison): boolean =>
		c.left.radii.length === c.right.radii.length && c.left.radii.every((r, i) => r === c.right.radii[i])
	const subsets: readonly (readonly [string, (c: Comparison) => boolean])[] = [
		["resolution differs", (c) => c.left.longEdge !== c.right.longEdge],
		["  … radii triple differs", (c) => c.left.longEdge !== c.right.longEdge && !sameRadii(c)],
		["  … radii triple equal", (c) => c.left.longEdge !== c.right.longEdge && sameRadii(c)],
		["same resolution", (c) => c.left.longEdge === c.right.longEdge],
	]
	for (const [label, predicate] of subsets) {
		const set = pairs.filter(
			(c) =>
				predicate(c) && c.left.binary.e1Q95 > 0 && c.right.binary.e1Q95 > 0 &&
				c.left.coherence.e1Q95 > 0 && c.right.coherence.e1Q95 > 0,
		)
		const binaryLog = set.map((c) => Math.abs(Math.log(c.left.binary.e1Q95 / c.right.binary.e1Q95)))
		const coherenceLog = set.map((c) => Math.abs(Math.log(c.left.coherence.e1Q95 / c.right.coherence.e1Q95)))
		resolutionSplit[label.trim()] = {
			n: set.length,
			binaryMedian: median(binaryLog),
			coherenceMedian: median(coherenceLog),
			coherenceRowsSmaller: set.filter((_, i) => coherenceLog[i] < binaryLog[i]).length,
		}
		console.log(
			`${label.padEnd(26)} n=${String(set.length).padStart(4)}  binary ${median(binaryLog).toFixed(4)}  ` +
				`coherence ${median(coherenceLog).toFixed(4)}  ` +
				`(coherence smaller on ${set.filter((_, i) => coherenceLog[i] < binaryLog[i]).length}/${set.length})`,
		)
	}
	const differingResolution = pairs.filter((c) => c.left.longEdge !== c.right.longEdge)
	console.log(
		`radii triple identical on ${differingResolution.filter(sameRadii).length}/${differingResolution.length} ` +
			`resolution-differing pairs (coherence.ts line tension 1, counted)`,
	)

	// How far the coherence F-membership fraction actually is from the (1 − β) SUBSTRATE.md §8
	// claims it is "exactly" — ties in the percentile field make the strict cut return more.
	const fractions = [...byFile.values()].map((s) => s.coherence.fFraction).sort((a, b) => a - b)
	const offBy = fractions.filter((f) => Math.abs(f - 0.25) > 1e-9).length
	console.log(
		`\ncoherence F fraction over ${fractions.length} files: min ${fractions[0].toFixed(4)}  ` +
			`p50 ${median(fractions).toFixed(4)}  p90 ${quantile(fractions, 0.9).toFixed(4)}  ` +
			`max ${fractions[fractions.length - 1].toFixed(4)}  |  not exactly (1−β): ${offBy}/${fractions.length}`,
	)

	// The prereg's two clauses, evaluated mechanically on both named statistics.
	console.log("\n--- SUBSTRATE_2_PREREG.md Measurement A, mechanical evaluation ---")
	const verdicts: Record<string, unknown> = {}
	for (const statName of ["fFraction", "e1Q95"]) {
		const binaryPairs = (table[`binary.${statName}`] as { pairs: { median: number } }).pairs.median
		const coherencePairs = (table[`coherence.${statName}`] as { pairs: { median: number } }).pairs.median
		const coherencePerturb = (table[`coherence.${statName}`] as { perturbations: { median: number } }).perturbations.median
		const clauseI = coherencePairs <= binaryPairs / 2
		const ratioToOwn = coherencePerturb > 0 ? coherencePairs / coherencePerturb : Number.POSITIVE_INFINITY
		verdicts[statName] = {
			binaryCrossRendition: binaryPairs,
			halfOfBinary: binaryPairs / 2,
			coherenceCrossRendition: coherencePairs,
			coherencePerturbation: coherencePerturb,
			clauseI_leqHalfBinary: clauseI,
			crossOverOwnPerturbationRatio: ratioToOwn,
		}
		console.log(
			`${statName}: binary-pairs ${binaryPairs.toFixed(4)} (half ${(binaryPairs / 2).toFixed(4)}) | ` +
				`coherence-pairs ${coherencePairs.toFixed(4)} → clause (i) ${clauseI ? "PASS" : "FAIL"} | ` +
				`coherence-perturb ${coherencePerturb.toFixed(4)} → cross/own ${ratioToOwn.toFixed(2)}×`,
		)
	}

	const payload = {
		what: "MEASUREMENT A — field summary drift, both substrates",
		writtenAt: new Date().toISOString(),
		counts: {
			files: byFile.size,
			planFiles: plan.files.length,
			errors,
			incomplete,
			pairs: pairs.length,
			pairsSameResolution: sameResolution.length,
			perturbations: perturbations.length,
		},
		table,
		commonSubset: commonTable,
		resolutionSplit,
		radiiIdenticalOnResolutionDifferingPairs: {
			identical: differingResolution.filter(sameRadii).length,
			of: differingResolution.length,
		},
		coherenceFieldFraction: {
			files: fractions.length,
			min: fractions[0],
			median: median(fractions),
			p90: quantile(fractions, 0.9),
			max: fractions[fractions.length - 1],
			notExactlyOneMinusBeta: offBy,
		},
		verdicts,
		perComparison: comparisons.map((c) => ({
			group: c.group,
			key: c.key,
			arm: c.arm,
			longEdges: [c.left.longEdge, c.right.longEdge],
			binary: {
				fFraction: [c.left.binary.fFraction, c.right.binary.fFraction],
				e1Q95: [c.left.binary.e1Q95, c.right.binary.e1Q95],
				rule: [c.left.binary.rule, c.right.binary.rule],
			},
			coherence: {
				fFraction: [c.left.coherence.fFraction, c.right.coherence.fFraction],
				e1Q95: [c.left.coherence.e1Q95, c.right.coherence.e1Q95],
			},
			radii: [c.left.radii, c.right.radii],
		})),
	}
	if (outPath !== undefined) {
		await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`)
		console.log(`\nwrote ${outPath}`)
	}
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		out: { type: "string" },
		plan: { type: "string" },
		shard: { type: "string" },
		summaries: { type: "string", multiple: true },
	},
})
const command = positionals[0]
if (command === "plan") {
	await buildPlan(path.resolve(values.out ?? path.join(HERE, "field-drift-plan.json")))
} else if (command === "compute") {
	await compute(path.resolve(values.plan!), values.shard ?? "0/1", path.resolve(values.out!))
} else if (command === "report") {
	await report(path.resolve(values.plan!), (values.summaries ?? []).map((p) => path.resolve(p)), values.out === undefined ? undefined : path.resolve(values.out))
} else {
	console.error("usage: field-drift.ts <plan|compute|report> [--plan …] [--shard i/n] [--out …] [--summaries …]")
	process.exit(2)
}
