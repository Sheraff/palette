/**
 * Build the round-3 trade-off fixture: `items.json` (blinded, servable) + `mapping.private.json`.
 *
 *     # from ../round-3-quality, which owns the probe:
 *     node --experimental-strip-types probe.ts \
 *       --set ../../../../data/devloop/sets/demo-20.txt --out ../round-3-tradeoffs/out/demo-20.jsonl
 *     node --experimental-strip-types build.ts     # rewrites items.json + mapping.private.json
 *     node --experimental-strip-types validate.ts  # exit 0 or it does not ship
 *
 * **Two items, two prices, both on demo-20 — deliberately.** `DECISIONS.md` D3's round-composition
 * clause draws round 3 beyond demo-20 *"except where a specific prior verdict is being re-tested"*,
 * and names D1's accent pairwise as the example. Both items here are exactly that: each one puts a
 * decision that was made without a price in front of the only instrument that can price it.
 *
 * - **T1 — D1's exchange rate.** The published (chroma-first) accent against the APCA-first accent,
 *   on the one cover where the two orders part. D1 ruled chroma-first *"until that verdict"*.
 * - **T2 — W-H's salience cut.** The published accent against the accent D3's stability level would
 *   elect if the level ranked the accent, on the first cover by sorted path where the two differ.
 *   `tos/integration-NOTES.md` §5 states the need in as many words: *"a round item that shows one
 *   cover twice, with and without the level on the accent, is the cheapest way to price it"*.
 *
 * Both counterfactual accents are colours the pipeline itself produced — they are entries of the
 * parse's own `accentCandidates`, i.e. representatives of retained nodes, and therefore exact triples
 * of the artwork. Nothing here invents a colour; `validate.ts` re-checks that against the bytes.
 *
 * Deterministic: the input is one JSONL file on disk, every ordering is a sort over a value read
 * from it, and nothing reads a clock or a map's iteration order.
 */

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { colorDistance, colorFromHex } from "../../../../src/contract/color.ts"
import { FOREGROUND_ACCENT_SEPARATION_DISTANCE } from "../../../../src/contract/constants.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, "..", "..", "..", "..", "..", "..")

/** The cover D1 names: the only one on which chroma-first and APCA-first elect different accents. */
const T1_IMAGE = "00/ab67616d00001e0200000f92552b0935b967964d.jpg"

/**
 * Blinded variant labels. Arbitrary handles, decodable only through `mapping.private.json`.
 *
 * `v1` is the palette the candidate publishes today and `v2` is the counterfactual, consistently
 * across both items — but nothing in `items.json` says so, and the side ORDER alternates by item
 * index parity, so neither the label nor the position carries the answer.
 */
const VARIANT_ID = { v1: "p2-tree-round3b-v1", v2: "p2-tree-round3b-v2" } as const
const BLINDED_ALGORITHM_VERSION = { v1: "p2-tree-round3b-0.3.0-v1", v2: "p2-tree-round3b-0.3.0-v2" } as const

type AccentCandidate = {
	repr: string
	lane: number
	nodeId: number
	chromaFromField: number
	lightnessMove: number
	fieldContrast: number
	stabilityLevel: number
	growth: number
}
type Row = {
	imagePath: string
	ok: boolean
	verdict: string
	palette: {
		background: string
		surface: string
		foreground: string
		accent: string
		gradient: null | { stops: { color: string; position: number }[] }
		surfaceCollapsed: boolean
		accentCollapsed: boolean
		algorithmVersion: string
		preprocessingVersion: string
	}
	accentCandidates: AccentCandidate[]
}

const RUN_FILE = "out/demo-20.jsonl"

const rows = readFileSync(join(HERE, RUN_FILE), "utf8")
	.trim()
	.split("\n")
	.map((line) => JSON.parse(line) as Row)
	.sort((first, second) => (first.imagePath < second.imagePath ? -1 : first.imagePath > second.imagePath ? 1 : 0))

const failed = rows.filter((row) => !row.ok)
if (failed.length > 0) throw new Error(`${RUN_FILE}: ${failed.length} failed rows — refusing to stage`)

// ---------------------------------------------------------------------------------------------
// The three elections, reconstructed from what the pipeline published
// ---------------------------------------------------------------------------------------------

/**
 * The accent the pool would elect from a given candidate order.
 *
 * The real pool is `accentCandidates` (two tiers, each chroma-sorted) followed by the residual pool,
 * and the published accent is its first entry clearing the contract's own foreground/accent
 * separation (`pipeline.ts`, D1). That last step is reproduced here rather than assumed, because a
 * counterfactual accent that the contract would have refused is not a counterfactual — it is an
 * invalid palette wearing one.
 */
function elect(candidates: readonly AccentCandidate[], foreground: string): AccentCandidate | null {
	const seen = new Set<string>()
	for (const candidate of candidates) {
		if (seen.has(candidate.repr)) continue
		seen.add(candidate.repr)
		if (colorDistance(colorFromHex(candidate.repr), colorFromHex(foreground)) >= FOREGROUND_ACCENT_SEPARATION_DISTANCE) {
			return candidate
		}
	}
	return null
}

/** D1's order, i.e. the published one: `accentCandidates` is already in it. */
const chromaFirst = (row: Row) => elect(row.accentCandidates, row.palette.foreground)

/** W-F's order: minimum |raw APCA| over the rendered field descending, ties keeping the published order. */
const apcaFirst = (row: Row) =>
	elect(
		row.accentCandidates
			.map((candidate, index) => ({ candidate, index }))
			.sort((first, second) => second.candidate.fieldContrast - first.candidate.fieldContrast || first.index - second.index)
			.map((entry) => entry.candidate),
		row.palette.foreground,
	)

/** D3's salience level in front of D1's order — the deviation `integration-NOTES.md` §5 records. */
const levelFirst = (row: Row) =>
	elect(
		row.accentCandidates
			.map((candidate, index) => ({ candidate, index }))
			.sort((first, second) => first.candidate.stabilityLevel - second.candidate.stabilityLevel || first.index - second.index)
			.map((entry) => entry.candidate),
		row.palette.foreground,
	)

// --- T1 -----------------------------------------------------------------------------------------

const t1Row = rows.find((row) => row.imagePath === T1_IMAGE)
if (!t1Row) throw new Error(`${T1_IMAGE} is not in ${RUN_FILE}`)
const t1Chroma = chromaFirst(t1Row)
const t1Apca = apcaFirst(t1Row)
if (!t1Chroma || !t1Apca) throw new Error(`${T1_IMAGE}: an accent election came back empty`)
if (t1Chroma.repr !== t1Row.palette.accent) {
	throw new Error(`${T1_IMAGE}: the chroma-first election ${t1Chroma.repr} is not the published accent ${t1Row.palette.accent}`)
}
if (t1Apca.repr === t1Chroma.repr) throw new Error(`${T1_IMAGE}: the two orders no longer part — D1's item has no content`)

// --- T2 -----------------------------------------------------------------------------------------

/**
 * The first cover by sorted path on which D3's level would move the published accent.
 *
 * Selection is a scan in sorted order with no further filter, so the item is not chosen for how big
 * or how pretty the disagreement is. The two properties that make the item honest — that the
 * chroma-first side IS the published palette, and that the two accents are further apart than their
 * own same-colour bar — are ASSERTED on whatever the scan returns, not used to pick it.
 */
const t2 = rows
	.map((row) => ({ row, chroma: chromaFirst(row), level: levelFirst(row) }))
	.find((entry) => entry.chroma !== null && entry.level !== null && entry.chroma.repr !== entry.level.repr)

const differingCovers = rows
	.map((row) => ({ row, chroma: chromaFirst(row), level: levelFirst(row) }))
	.filter((entry) => entry.chroma !== null && entry.level !== null && entry.chroma.repr !== entry.level.repr)

if (t2 && t2.chroma!.repr !== t2.row.palette.accent) {
	throw new Error(
		`${t2.row.imagePath}: the chroma-first election ${t2.chroma!.repr} is not the published accent ${t2.row.palette.accent}; ` +
			`side X would not be a palette this candidate publishes`,
	)
}

// ---------------------------------------------------------------------------------------------
// Fingerprint
// ---------------------------------------------------------------------------------------------

const gitCommit = execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).trim()
const dirty =
	execFileSync("git", ["-C", ROOT, "status", "--porcelain", "research/v3/prototypes/p2-tree/tos"], { encoding: "utf8" })
		.trim().length > 0

// ---------------------------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------------------------

function slugOf(imagePathRelative: string): string {
	const base = imagePathRelative.split("/").pop() ?? imagePathRelative
	return base.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

type Question = {
	question: "d1-exchange-rate" | "d3-salience-cut"
	row: Row
	published: AccentCandidate
	counterfactual: AccentCandidate
	counterfactualOrder: string
}

const questions: Question[] = [
	{
		question: "d1-exchange-rate",
		row: t1Row,
		published: t1Chroma,
		counterfactual: t1Apca,
		counterfactualOrder: "minimum |raw APCA| over the rendered field, descending",
	},
]
if (t2) {
	questions.push({
		question: "d3-salience-cut",
		row: t2.row,
		published: t2.chroma!,
		counterfactual: t2.level!,
		counterfactualOrder: "D3's stability level ascending, then the published order",
	})
}

/** Presentation order: sorted image path, like every other ordering in this round. */
questions.sort((first, second) =>
	first.row.imagePath < second.row.imagePath ? -1 : first.row.imagePath > second.row.imagePath ? 1 : 0,
)

function paletteWithAccent(row: Row, accent: string) {
	return {
		background: row.palette.background,
		surface: row.palette.surface,
		foreground: row.palette.foreground,
		accent,
		gradient: row.palette.gradient,
		surfaceCollapsed: row.palette.surfaceCollapsed,
		// Measured against the colours actually published on THIS side, never copied from the run.
		accentCollapsed: accent === row.palette.foreground,
	}
}

function sideOf(key: "v1" | "v2", question: Question) {
	const accent = key === "v1" ? question.published.repr : question.counterfactual.repr
	return {
		variantId: VARIANT_ID[key],
		palette: paletteWithAccent(question.row, accent),
		fingerprint: {
			algorithmVersion: BLINDED_ALGORITHM_VERSION[key],
			preprocessingVersion: question.row.palette.preprocessingVersion,
			gitCommit,
			dirty,
		},
	}
}

const items = questions.map((question, index) => {
	// Side alternation by item-index parity: neither position belongs to either accent order.
	const [first, second]: ["v1" | "v2", "v1" | "v2"] = index % 2 === 0 ? ["v1", "v2"] : ["v2", "v1"]
	return {
		itemId: slugOf(question.row.imagePath),
		imagePath: question.row.imagePath,
		collection: "demo-20",
		sides: [sideOf(first, question), sideOf(second, question)],
	}
})

for (const item of items) if (!existsSync(join(ROOT, item.imagePath))) throw new Error(`image missing on disk: ${item.imagePath}`)

writeFileSync(join(HERE, "items.json"), `${JSON.stringify(items, null, "\t")}\n`)

writeFileSync(
	join(HERE, "mapping.private.json"),
	`${JSON.stringify(
		{
			_note: "NOT SERVABLE. Decodes the blinded sides of round-3-tradeoffs after release.",
			_roundId: "p2-round-3-tradeoffs",
			_variants: {
				[VARIANT_ID.v1]: {
					candidateId: "p2-tos",
					algorithmVersion: t1Row.palette.algorithmVersion,
					what: "the palette the merged candidate publishes today — chroma-first accent (D1)",
				},
				[VARIANT_ID.v2]: {
					candidateId: "p2-tos",
					algorithmVersion: t1Row.palette.algorithmVersion,
					what: "the same run with ONE role substituted: the accent the counterfactual order elects. Not a candidate output; every other role and the gradient are byte-identical to v1.",
				},
			},
			_runFile: `review-rounds/round-3-tradeoffs/${RUN_FILE}`,
			_salienceScan: {
				rule: "first cover by sorted repo-relative path where the level-first election differs from the chroma-first election",
				coversScanned: rows.length,
				coversDiffering: differingCovers.length,
				differingPaths: differingCovers.map((entry) => entry.row.imagePath),
				selected: t2 ? t2.row.imagePath : null,
				noneDiffered: t2 === undefined,
			},
			_items: Object.fromEntries(
				questions.map((question, index) => [
					slugOf(question.row.imagePath),
					{
						question: question.question,
						imagePath: question.row.imagePath,
						verdict: question.row.verdict,
						sideOrder: index % 2 === 0 ? ["v1", "v2"] : ["v2", "v1"],
						v1Accent: {
							hex: question.published.repr,
							order: "chroma from the field, descending (D1, the published order)",
							chromaFromField: question.published.chromaFromField,
							fieldContrast: question.published.fieldContrast,
							stabilityLevel: question.published.stabilityLevel,
							growth: question.published.growth,
							lane: question.published.lane,
							nodeId: question.published.nodeId,
						},
						v2Accent: {
							hex: question.counterfactual.repr,
							order: question.counterfactualOrder,
							chromaFromField: question.counterfactual.chromaFromField,
							fieldContrast: question.counterfactual.fieldContrast,
							stabilityLevel: question.counterfactual.stabilityLevel,
							growth: question.counterfactual.growth,
							lane: question.counterfactual.lane,
							nodeId: question.counterfactual.nodeId,
						},
						accentSeparation: colorDistance(
							colorFromHex(question.published.repr),
							colorFromHex(question.counterfactual.repr),
						),
						foregroundAccentDistance: {
							v1: colorDistance(colorFromHex(question.row.palette.foreground), colorFromHex(question.published.repr)),
							v2: colorDistance(colorFromHex(question.row.palette.foreground), colorFromHex(question.counterfactual.repr)),
							floor: FOREGROUND_ACCENT_SEPARATION_DISTANCE,
						},
					},
				]),
			),
		},
		null,
		"\t",
	)}\n`,
)

for (const question of questions) {
	console.log(
		[
			question.question,
			slugOf(question.row.imagePath).slice(0, 14),
			`v1=${question.published.repr}`,
			`v2=${question.counterfactual.repr}`,
			`apart=${colorDistance(colorFromHex(question.published.repr), colorFromHex(question.counterfactual.repr)).toFixed(4)}`,
			question.row.imagePath,
		].join(" | "),
	)
}
console.log(`covers scanned=${rows.length} differing=${differingCovers.length} t2=${t2 ? t2.row.imagePath : "NONE — batch B is T1 alone"}`)
console.log(`gitCommit=${gitCommit} dirty=${dirty}`)
console.log(`wrote ${items.length} items`)
