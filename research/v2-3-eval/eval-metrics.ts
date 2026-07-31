import { readdir } from "node:fs/promises"
import { resolve } from "node:path"
import { parseArgs } from "node:util"
import { rgbToOKLab } from "../src/color.ts"
import type { OKLab, RGB } from "../src/types.ts"
import { dataRoot, invariant, readJson, repoRoot, roles, type Role, verdictsPath, writeJsonAtomic } from "./src/shared.ts"
import { loadVerdicts, type VerdictRecord } from "./src/warehouse.ts"
import type { CandidateDump } from "./export-candidates.ts"

/**
 * Split candidate RECALL from RANKING.
 *
 *   node --no-warnings --experimental-strip-types research/v2-3-eval/eval-metrics.ts \
 *     [--candidates <label>] [--epsilon 0.04] [--source all|corrections|endorsed] [--json <path>]
 *
 * For every human answer in the warehouse it asks two separate questions against the exported candidate
 * domain: does the domain *contain* a treatment within epsilon of the human's palette (recall), and how
 * far down our ordering the first such treatment sits (ranking). A case where the answer is absent is a
 * recall failure and cannot be fixed by scoring; a case where it is present but ranked below our winner
 * is a ranking failure. Both were previously debugged as the same thing.
 *
 * Distances are OKLab Euclidean; 1 JND is about 0.02, so the default epsilon of 0.04 is ~2 JND per role.
 * Palettes are compared by min-cost bipartite matching (roles are a labelling humans disagree about), with
 * the role-aligned cost reported alongside.
 */

const { values } = parseArgs({
	options: {
		candidates: { type: "string", default: "v2-3" },
		epsilon: { type: "string", default: "0.04" },
		source: { type: "string", default: "all" },
		warehouse: { type: "string" },
		json: { type: "string" },
		verbose: { type: "boolean", default: false },
	},
	strict: true,
})

const epsilon = Number(values.epsilon)
invariant(Number.isFinite(epsilon) && epsilon > 0, "--epsilon must be a positive number")
invariant(["all", "corrections", "endorsed"].includes(values.source ?? "all"),
	"--source must be all, corrections, or endorsed")
const epsilonTiers = [0.02, 0.04, 0.06] as const

function toOKLab(hex: string): OKLab {
	const rgb: RGB = [
		Number.parseInt(hex.slice(1, 3), 16),
		Number.parseInt(hex.slice(3, 5), 16),
		Number.parseInt(hex.slice(5, 7), 16),
	]
	return rgbToOKLab(rgb)
}

function okDistance(a: OKLab, b: OKLab): number {
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/** All permutations of 0..n-1, generated in a fixed order. */
function permutations(n: number): number[][] {
	if (n <= 1) return [[0]]
	const result: number[][] = []
	for (const rest of permutations(n - 1)) {
		for (let position = 0; position <= rest.length; position += 1) {
			result.push([...rest.slice(0, position), n - 1, ...rest.slice(position)])
		}
	}
	return result
}
const permutationsOfFour = permutations(4)

/**
 * Min-cost bipartite matching between two palettes. With four colors per side the assignment problem is
 * 24 permutations, so it is solved exactly by enumeration - no approximation, fully deterministic.
 */
function assignmentCost(a: readonly OKLab[], b: readonly OKLab[]): number {
	invariant(a.length === b.length, "Assignment needs equally sized palettes")
	if (a.length === 4) {
		let best = Infinity
		for (const permutation of permutationsOfFour) {
			let total = 0
			for (let index = 0; index < 4; index += 1) total += okDistance(a[index], b[permutation[index]])
			best = Math.min(best, total / 4)
		}
		return best
	}
	let total = 0
	for (let index = 0; index < a.length; index += 1) total += okDistance(a[index], b[index])
	return total / a.length
}

type CandidateKeyParts = Readonly<{ hexes: readonly string[]; oklab: readonly OKLab[]; gradient: boolean }>

function parseKey(key: string): CandidateKeyParts {
	const parts = key.split(":")
	invariant(parts.length === 5, `Malformed candidate key ${key}`)
	const hexes = parts.slice(0, 4)
	return { hexes, oklab: hexes.map(toOKLab), gradient: parts[4] === "gradient" }
}

/** A human answer: either explicitly corrected role colors, or a palette the human called strong. */
type Target = Readonly<{
	image: string
	source: "correction" | "endorsed"
	label: string
	batch: string
	line: number
	roles: readonly Role[]
	hexes: readonly string[]
	oklab: readonly OKLab[]
	gradient: boolean | null
	verdict: string | null
}>

function endorsedPalette(record: VerdictRecord): Target | null {
	if (record.verdict !== "strong") return null
	const label = record.comparison === "ab"
		? record.preference.label
		: record.verdictApplies[0] ?? record.labels[0] ?? null
	if (label === null) return null
	const palette = record.palettes[label]
	if (palette === undefined) return null
	const hexes = roles.map((role) => palette[role].hex)
	return {
		image: record.image,
		source: "endorsed",
		label,
		batch: record.batch,
		line: record.line,
		roles: [...roles],
		hexes,
		oklab: hexes.map(toOKLab),
		gradient: palette.gradient,
		verdict: record.verdict,
	}
}

function correctionTarget(record: VerdictRecord): Target | null {
	const corrected = roles.filter((role) => typeof record.corrections[role] === "string")
	if (corrected.length === 0) return null
	const hexes = corrected.map((role) => record.corrections[role]!)
	return {
		image: record.image,
		source: "correction",
		label: record.preference.label ?? record.labels[0] ?? "",
		batch: record.batch,
		line: record.line,
		roles: corrected,
		hexes,
		oklab: hexes.map(toOKLab),
		gradient: null,
		verdict: record.verdict,
	}
}

const warehouse = values.warehouse === undefined ? verdictsPath : resolve(repoRoot, values.warehouse)
const records = await loadVerdicts(warehouse)
invariant(records.length > 0, `No verdicts found at ${warehouse}`)

const candidatesRoot = resolve(dataRoot, "candidates", values.candidates!)
let dumpFiles: string[]
try {
	dumpFiles = (await readdir(candidatesRoot)).filter((name) => name.endsWith(".json")).sort()
} catch (error) {
	if ((error as NodeJS.ErrnoException).code === "ENOENT") {
		throw new Error(`No candidate dumps for "${values.candidates}". Run export-candidates.ts first.`)
	}
	throw error
}
const dumps = new Map<string, CandidateDump>()
for (const file of dumpFiles) {
	const dump = await readJson<CandidateDump>(resolve(candidatesRoot, file))
	dumps.set(dump.image, dump)
}

const targets: Target[] = []
for (const record of records) {
	const correction = correctionTarget(record)
	if (correction !== null && values.source !== "endorsed") targets.push(correction)
	// A correction supersedes the endorsed palette of the same record: it is the stronger evidence.
	if (correction === null && values.source !== "corrections") {
		const endorsed = endorsedPalette(record)
		if (endorsed !== null) targets.push(endorsed)
	}
}
targets.sort((a, b) => (a.image < b.image ? -1 : a.image > b.image ? 1 : a.line - b.line))

type Measurement = Readonly<{
	target: Target
	candidateCount: number
	oracleCost: number
	oracleRank: number
	oracleKey: string
	oracleGradientMatches: boolean | null
	winnerCost: number
	winnerKey: string
	winnerRank: number
	firstAcceptableRank: number | null
	roleAlignedWinnerCost: number
	classification: "recall-failure" | "ranking-failure" | "match"
}>

const measurements: Measurement[] = []
const missingDumps = new Set<string>()

for (const target of targets) {
	const dump = dumps.get(target.image)
	if (dump === undefined) {
		missingDumps.add(target.image)
		continue
	}
	// Restrict a candidate to the roles the human actually answered, so partial corrections stay usable.
	const project = (parts: CandidateKeyParts): readonly OKLab[] =>
		target.roles.length === 4 ? parts.oklab : target.roles.map((role) => parts.oklab[roles.indexOf(role)])

	let oracleCost = Infinity
	let oracleRank = 0
	let oracleKey = ""
	let oracleGradient: boolean | null = null
	let firstAcceptableRank: number | null = null
	for (const candidate of dump.candidates) {
		const parts = parseKey(candidate.key)
		const cost = assignmentCost(target.oklab, project(parts))
		if (cost < oracleCost) {
			oracleCost = cost
			oracleRank = candidate.rank
			oracleKey = candidate.key
			oracleGradient = parts.gradient
		}
		if (cost <= epsilon && (firstAcceptableRank === null || candidate.rank < firstAcceptableRank)) {
			firstAcceptableRank = candidate.rank
		}
	}
	const publishedParts = parseKey(dump.publishedWinnerKey)
	const winnerCost = assignmentCost(target.oklab, project(publishedParts))
	const roleAligned = target.roles.reduce((sum, role, index) =>
		sum + okDistance(target.oklab[index], publishedParts.oklab[roles.indexOf(role)]), 0) / target.roles.length
	const publishedRank = dump.candidates.find((candidate) => candidate.key === dump.publishedWinnerKey)?.rank ?? 0
	measurements.push({
		target,
		candidateCount: dump.candidateCount,
		oracleCost,
		oracleRank,
		oracleKey,
		oracleGradientMatches: target.gradient === null || oracleGradient === null
			? null
			: target.gradient === oracleGradient,
		winnerCost,
		winnerKey: dump.publishedWinnerKey,
		winnerRank: publishedRank,
		firstAcceptableRank,
		roleAlignedWinnerCost: roleAligned,
		classification: oracleCost > epsilon
			? "recall-failure"
			: winnerCost > epsilon ? "ranking-failure" : "match",
	})
}

function mean(values: readonly number[]): number {
	return values.length === 0 ? Number.NaN : values.reduce((sum, value) => sum + value, 0) / values.length
}

function share(values: readonly number[], limit: number): number {
	return values.length === 0 ? Number.NaN : values.filter((value) => value <= limit).length / values.length
}

function format(value: number, digits = 3): string {
	return Number.isNaN(value) ? "n/a" : value.toFixed(digits)
}

/**
 * Human-agreement ceiling: how far apart two independent human answers for the same image are. This is
 * the bound on any algorithm's achievable agreement - we cannot be closer to "the" human answer than
 * humans are to each other.
 */
const ceilingPairs: { image: string; cost: number; a: Target; b: Target }[] = []
const byImage = new Map<string, Target[]>()
for (const measurement of measurements) {
	const list = byImage.get(measurement.target.image) ?? []
	list.push(measurement.target)
	byImage.set(measurement.target.image, list)
}
for (const [image, list] of [...byImage.entries()].sort()) {
	const complete = list.filter((target) => target.roles.length === 4)
	for (let i = 0; i < complete.length; i += 1) {
		for (let j = i + 1; j < complete.length; j += 1) {
			// Two records that endorsed the identical palette carry no independent information.
			if (complete[i].hexes.join() === complete[j].hexes.join()) continue
			ceilingPairs.push({
				image,
				cost: assignmentCost(complete[i].oklab, complete[j].oklab),
				a: complete[i],
				b: complete[j],
			})
		}
	}
}

const oracleCosts = measurements.map((measurement) => measurement.oracleCost)
const winnerCosts = measurements.map((measurement) => measurement.winnerCost)
const ceilingCosts = ceilingPairs.map((pair) => pair.cost)

process.stdout.write(`Candidate domain "${values.candidates}" - ${dumps.size} image(s) exported, `
	+ `${measurements.length} human answer(s) measured (${targets.filter((t) => t.source === "correction").length} `
	+ `correction, ${targets.filter((t) => t.source === "endorsed").length} endorsed), epsilon ${epsilon}\n\n`)

process.stdout.write("HEADLINE (OKLab cost, lower is better; 1 JND = 0.02)\n")
process.stdout.write(`  human-agreement ceiling   ${format(mean(ceilingCosts))}  `
	+ `(${ceilingPairs.length} independent pair(s), ${format(share(ceilingCosts, epsilon) * 100, 0)}% within epsilon)\n`)
process.stdout.write(`  oracle over candidates    ${format(mean(oracleCosts))}  `
	+ `(${format(share(oracleCosts, epsilon) * 100, 0)}% within epsilon - this is RECALL)\n`)
process.stdout.write(`  our published ranking     ${format(mean(winnerCosts))}  `
	+ `(${format(share(winnerCosts, epsilon) * 100, 0)}% within epsilon - this is RANKING)\n\n`)

const endorsedCount = measurements.filter((measurement) => measurement.target.source === "endorsed").length
if (endorsedCount > 0) {
	process.stdout.write(`  NOTE: ${endorsedCount} of ${measurements.length} answers are "endorsed" proxies - palettes this\n`
		+ "  family of algorithms produced and a human graded strong. Recall against them is near-guaranteed and\n"
		+ "  measures retention, not reach. Only \"correction\" answers are independent of what we already build.\n")
}
process.stdout.write("\nRECALL by epsilon tier\n")
for (const tier of epsilonTiers) {
	process.stdout.write(`  <= ${tier.toFixed(2)} (${(tier / 0.02).toFixed(0)} JND)  `
		+ `oracle ${format(share(oracleCosts, tier) * 100, 0).padStart(3)}%   `
		+ `published ${format(share(winnerCosts, tier) * 100, 0).padStart(3)}%\n`)
}

const failures = measurements.filter((measurement) => measurement.classification !== "match")
const recallFailures = failures.filter((measurement) => measurement.classification === "recall-failure")
const rankingFailures = failures.filter((measurement) => measurement.classification === "ranking-failure")
process.stdout.write(`\nFAILURE SPLIT at epsilon ${epsilon}: `
	+ `${recallFailures.length} recall (answer absent from the domain), `
	+ `${rankingFailures.length} ranking (answer present, we ranked another first), `
	+ `${measurements.length - failures.length} match\n`)

const rows = (values.verbose ? measurements : failures)
	.sort((a, b) => b.oracleCost - a.oracleCost || (a.target.image < b.target.image ? -1 : 1))
if (rows.length > 0) {
	const header = ["image", "src", "label", "oracle", "@rank", "1st ok", "published", "class"]
	const table = [header, ...rows.map((measurement) => [
		measurement.target.image,
		measurement.target.source === "correction" ? "corr" : "endr",
		measurement.target.label,
		format(measurement.oracleCost),
		String(measurement.oracleRank),
		measurement.firstAcceptableRank === null ? "-" : String(measurement.firstAcceptableRank),
		format(measurement.winnerCost),
		measurement.classification,
	])]
	const widths = header.map((_, column) => Math.max(...table.map((row) => row[column].length)))
	process.stdout.write(`\n${values.verbose ? "ALL MEASUREMENTS" : "FAILURES"}\n`)
	for (const row of table) {
		process.stdout.write(`  ${row.map((cell, column) => cell.padEnd(widths[column])).join("  ").trimEnd()}\n`)
	}
}

if (missingDumps.size > 0) {
	process.stdout.write(`\nNo candidate dump for ${missingDumps.size} image(s) with human answers: `
		+ `${[...missingDumps].sort().join(", ")}\n  run export-candidates.ts for them to include them.\n`)
}

if (values.json !== undefined) {
	const path = resolve(repoRoot, values.json)
	await writeJsonAtomic(path, {
		schemaVersion: 1,
		candidateLabel: values.candidates,
		epsilon,
		headline: {
			humanAgreementCeiling: { mean: mean(ceilingCosts), pairs: ceilingPairs.length, withinEpsilon: share(ceilingCosts, epsilon) },
			oracleOverCandidates: { mean: mean(oracleCosts), withinEpsilon: share(oracleCosts, epsilon) },
			ourRanking: { mean: mean(winnerCosts), withinEpsilon: share(winnerCosts, epsilon) },
		},
		failureSplit: {
			recall: recallFailures.length,
			ranking: rankingFailures.length,
			match: measurements.length - failures.length,
		},
		measurements: measurements.map((measurement) => ({ ...measurement, target: { ...measurement.target, oklab: undefined } })),
		missingDumps: [...missingDumps].sort(),
	})
	process.stdout.write(`wrote ${path}\n`)
}
