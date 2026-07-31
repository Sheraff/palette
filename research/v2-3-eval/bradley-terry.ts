import { parseArgs } from "node:util"
import { resolve } from "node:path"
import { invariant, repoRoot, verdictsPath, writeJsonAtomic } from "./src/shared.ts"
import { loadVerdicts, type VerdictRecord } from "./src/warehouse.ts"

/**
 * Fit Bradley-Terry latent quality scores over every pairwise preference in the warehouse, so rounds
 * that never faced each other directly stay comparable through their shared opponents.
 *
 *   node --no-warnings --experimental-strip-types research/v2-3-eval/bradley-terry.ts \
 *     [--anchor <label>] [--bootstrap <n>] [--json <path>]
 *
 * Ties (`preference: equal` on a real A/B comparison) count as half a win to each side. A weak prior of
 * `--prior` virtual comparisons against a reference of strength 1 keeps undefeated and winless labels
 * finite. Confidence intervals come from a seeded bootstrap, so the whole thing is deterministic.
 */

const { values } = parseArgs({
	options: {
		anchor: { type: "string" },
		bootstrap: { type: "string", default: "2000" },
		prior: { type: "string", default: "1" },
		warehouse: { type: "string" },
		json: { type: "string" },
	},
	strict: true,
})

const bootstrapSamples = Number(values.bootstrap)
const prior = Number(values.prior)
invariant(Number.isSafeInteger(bootstrapSamples) && bootstrapSamples >= 0, "--bootstrap must be a non-negative integer")
invariant(Number.isFinite(prior) && prior >= 0, "--prior must be a non-negative number")

type Comparison = Readonly<{ winner: string; loser: string; weight: number }>

/** One A/B record becomes one comparison; a tie becomes half a win in each direction. */
function comparisons(records: readonly VerdictRecord[]): Comparison[] {
	const result: Comparison[] = []
	for (const record of records) {
		if (record.comparison !== "ab") continue
		const [first, second] = record.labels
		if (record.preference.label === null) {
			result.push({ winner: first, loser: second, weight: 0.5 }, { winner: second, loser: first, weight: 0.5 })
			continue
		}
		const winner = record.preference.label
		const loser = winner === first ? second : first
		invariant(record.labels.includes(winner), `Record for ${record.image} prefers a label outside its pair`)
		result.push({ winner, loser, weight: 1 })
	}
	return result
}

/**
 * Minorization-maximization (Hunter 2004) with a conjugate prior: each label also plays `prior` virtual
 * comparisons against a reference of strength 1, which is what keeps an undefeated label from diverging.
 */
function fit(labels: readonly string[], data: readonly Comparison[]): Map<string, number> {
	const index = new Map(labels.map((label, position) => [label, position]))
	const wins = new Float64Array(labels.length)
	const pairs = new Map<number, number>()
	for (const comparison of data) {
		const winner = index.get(comparison.winner)!
		const loser = index.get(comparison.loser)!
		wins[winner] += comparison.weight
		const key = winner < loser ? winner * labels.length + loser : loser * labels.length + winner
		pairs.set(key, (pairs.get(key) ?? 0) + comparison.weight)
	}
	let strength = new Float64Array(labels.length).fill(1)
	for (let iteration = 0; iteration < 10_000; iteration += 1) {
		const next = new Float64Array(labels.length)
		for (let i = 0; i < labels.length; i += 1) {
			let denominator = prior / (strength[i] + 1)
			for (let j = 0; j < labels.length; j += 1) {
				if (i === j) continue
				const key = i < j ? i * labels.length + j : j * labels.length + i
				const played = pairs.get(key)
				if (played === undefined) continue
				denominator += played / (strength[i] + strength[j])
			}
			next[i] = denominator > 0 ? (wins[i] + prior * 0.5) / denominator : strength[i]
		}
		// Renormalize to a geometric mean of 1 so the iteration cannot drift as a whole.
		let logSum = 0
		for (const value of next) logSum += Math.log(value)
		const scale = Math.exp(-logSum / labels.length)
		let delta = 0
		for (let i = 0; i < labels.length; i += 1) {
			const scaled = next[i] * scale
			delta = Math.max(delta, Math.abs(scaled - strength[i]) / strength[i])
			next[i] = scaled
		}
		strength = next
		if (delta < 1e-13) break
	}
	return new Map(labels.map((label, position) => [label, Math.log(strength[position])]))
}

/** Deterministic PRNG so bootstrap intervals are reproducible. */
function mulberry32(seed: number): () => number {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = state
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
	}
}

const warehouse = values.warehouse === undefined ? verdictsPath : resolve(repoRoot, values.warehouse)
const records = await loadVerdicts(warehouse)
const abRecords = records.filter((record) => record.comparison === "ab")
invariant(abRecords.length > 0, "The warehouse holds no A/B comparisons yet")

const data = comparisons(abRecords)
const labels = [...new Set(data.flatMap((comparison) => [comparison.winner, comparison.loser]))].sort()
const scores = fit(labels, data)
const anchor = values.anchor ?? (labels.includes("v2-2") ? "v2-2" : labels[0])
invariant(scores.has(anchor), `Anchor label "${anchor}" has no comparisons`)
const offset = scores.get(anchor)!

// Bootstrap over whole records, so a resample keeps each judgement intact.
const intervals = new Map<string, [number, number]>()
if (bootstrapSamples > 0) {
	const samples = new Map(labels.map((label) => [label, [] as number[]]))
	const random = mulberry32(0x5eed)
	for (let round = 0; round < bootstrapSamples; round += 1) {
		const resampled: VerdictRecord[] = []
		for (let pick = 0; pick < abRecords.length; pick += 1) {
			resampled.push(abRecords[Math.floor(random() * abRecords.length)])
		}
		const resampledData = comparisons(resampled)
		const present = new Set(resampledData.flatMap((comparison) => [comparison.winner, comparison.loser]))
		// Labels missing from a resample keep their prior-only strength: fit over all labels, so the
		// vector stays the same length and the anchor is always defined.
		const roundScores = fit(labels, resampledData)
		const roundOffset = roundScores.get(anchor)!
		for (const label of labels) {
			if (!present.has(label)) continue
			samples.get(label)!.push(roundScores.get(label)! - roundOffset)
		}
	}
	for (const label of labels) {
		const sorted = samples.get(label)!.sort((a, b) => a - b)
		if (sorted.length < 20) continue
		const low = sorted[Math.floor(0.025 * (sorted.length - 1))]
		const high = sorted[Math.ceil(0.975 * (sorted.length - 1))]
		intervals.set(label, [low, high])
	}
}

type Row = Readonly<{
	label: string
	comparisons: number
	wins: number
	losses: number
	ties: number
	score: number
	interval: readonly [number, number] | null
	winProbabilityVsAnchor: number
}>

const rows: Row[] = labels.map((label) => {
	let wins = 0
	let losses = 0
	let ties = 0
	for (const record of abRecords) {
		if (!record.labels.includes(label)) continue
		if (record.preference.label === null) ties += 1
		else if (record.preference.label === label) wins += 1
		else losses += 1
	}
	const score = scores.get(label)! - offset
	return {
		label,
		comparisons: wins + losses + ties,
		wins,
		losses,
		ties,
		score,
		interval: intervals.get(label) ?? null,
		winProbabilityVsAnchor: 1 / (1 + Math.exp(-score)),
	}
}).sort((a, b) => b.score - a.score || (a.label < b.label ? -1 : 1))

const columns = ["label", "n", "W-L-T", "BT score", "95% CI", `P(beat ${anchor})`]
const table = [columns, ...rows.map((row) => [
	row.label,
	String(row.comparisons),
	`${row.wins}-${row.losses}-${row.ties}`,
	row.score.toFixed(3),
	row.interval === null ? "-" : `[${row.interval[0].toFixed(2)}, ${row.interval[1].toFixed(2)}]`,
	row.winProbabilityVsAnchor.toFixed(2),
])]
const widths = columns.map((_, column) => Math.max(...table.map((row) => row[column].length)))

process.stdout.write(`Bradley-Terry over ${abRecords.length} A/B record(s), ${labels.length} labels, `
	+ `anchored at ${anchor} (score 0)\n`)
for (const row of table) process.stdout.write(`${row.map((cell, column) => cell.padEnd(widths[column])).join("  ").trimEnd()}\n`)
process.stdout.write("Scores are log-odds: +0.69 means roughly 2:1 preferred over the anchor.\n")

const thin = rows.filter((row) => row.comparisons < 3).map((row) => row.label)
if (thin.length > 0) {
	process.stdout.write(`Thinly compared (<3 records), read their intervals not their scores: ${thin.join(", ")}\n`)
}

if (values.json !== undefined) {
	const path = resolve(repoRoot, values.json)
	await writeJsonAtomic(path, {
		schemaVersion: 1,
		warehouseRecords: records.length,
		abRecords: abRecords.length,
		anchor,
		prior,
		bootstrapSamples,
		labels: rows,
	})
	process.stdout.write(`wrote ${path}\n`)
}
