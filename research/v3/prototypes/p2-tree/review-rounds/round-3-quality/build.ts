/**
 * Build the round-3 quality fixture: `items.json` (blinded, servable) + `mapping.private.json`.
 *
 *     node --experimental-strip-types pool.ts                          # rewrites fresh-40.txt
 *     node --experimental-strip-types probe.ts --set fresh-40.txt --out out/fresh-40.jsonl
 *     node --experimental-strip-types build.ts                         # rewrites both files
 *     node --experimental-strip-types validate.ts                      # exit 0 or it does not ship
 *
 * Absolute grading, one palette per item, six fresh covers. Deterministic by construction: the input
 * is one JSONL file already on disk, every ordering is a sort over a value read from it, and nothing
 * here reads a clock, a hash of a filename or a map's iteration order.
 *
 * ## The selection, stated before the covers were looked at
 *
 * A **class** is the published shape of the reading, four facts wide:
 * `verdict | gradient published? | surfaceCollapsed | accentCollapsed`. Those are the structural
 * choices the pipeline makes; a round that grades six covers of one class grades one choice six
 * times. The 40 fresh runs fall into 7 classes, so 6 items can cover 6 of them:
 *
 * 1. classes ordered by **population descending**, ties by the class's first cover's sorted path;
 * 2. the first 6 classes are taken — the 7th is dropped, and `mapping.private.json` records which;
 * 3. each class's representative is its **first cover by sorted repo-relative path**, so no cover is
 *    in the round for how it looks;
 * 4. **D7's margin guard** (`DECISIONS.md`: *"the reviewer grades margins; optimizers sit on
 *    floors"*) is applied at selection: a representative whose closest distinct published role pair
 *    sits under `MARGIN_FLOOR` in OKLab is skipped for the next cover of the same class, and the
 *    swap is recorded. A class whose covers all violate is skipped entirely, for the next class.
 */

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { colorDistance, colorFromHex } from "../../../../src/contract/color.ts"
import type { ProbeRow } from "./probe.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, "..", "..", "..", "..", "..", "..")

/** How many covers the round shows. */
export const ITEM_COUNT = 6

/**
 * D7's margin floor, in OKLab distance, applied to every distinct published role pair.
 *
 * `[HELD]` — this is **not** a new contract constant and nothing in the pipeline reads it. It is the
 * staging worker's brief made executable: a pair that clears the same-colour bar by an epsilon
 * publishes as "distinct" and reads as identical, so a round item built on one would collect a
 * complaint about the instrument rather than a grade of the palette. 0.02 is roughly the largest
 * same-colour bar (`LARGEST_SAME_COLOR_BAR`) rather than a perceptual finding, and it is a
 * *selection* filter here — it decides which covers this round shows, never what any pipeline does.
 */
export const MARGIN_FLOOR = 0.02

/**
 * The blinded variant label and algorithm version written into `items.json`.
 *
 * Round 1's rule, unchanged: no candidate id, family name or pipeline string appears in the servable
 * file, because the grade is supposed to be about the palette. The true names are recorded verbatim
 * in `mapping.private.json`, so nothing is lost — it is moved. There is only one candidate in this
 * round and therefore nothing to shuffle; what is withheld is *whose* palette it is, which is still
 * worth withholding when the same reviewer has graded this prototype's ancestors twice already.
 */
const VARIANT_ID = "p2-tree-cycle2-v1"
const BLINDED_ALGORITHM_VERSION = "p2-tree-cycle2-0.3.0-v1"

const ROLES = ["background", "surface", "foreground", "accent"] as const

type Row = ProbeRow & { ok: true }

// ---------------------------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------------------------

const RUN_FILE = "out/fresh-40.jsonl"

const allRows = readFileSync(join(HERE, RUN_FILE), "utf8")
	.trim()
	.split("\n")
	.map((line) => JSON.parse(line) as ProbeRow)
	.sort((first, second) => (first.imagePath < second.imagePath ? -1 : first.imagePath > second.imagePath ? 1 : 0))

/**
 * A failed run is a ROW, not a gap. Dropping the covers the candidate cannot handle would make the
 * selection a survivor sample; they are excluded from *selection* (there is no palette to grade) and
 * counted out loud in `mapping.private.json` and on stdout.
 */
const failedRows = allRows.filter((row) => !row.ok)
const rows = allRows.filter((row): row is Row => row.ok)

// ---------------------------------------------------------------------------------------------
// Classes and the margin guard
// ---------------------------------------------------------------------------------------------

function classOf(row: Row): string {
	const palette = row.palette!
	return [
		row.verdict,
		palette.gradient === null ? "flat" : "grad",
		`sc${palette.surfaceCollapsed ? 1 : 0}`,
		`ac${palette.accentCollapsed ? 1 : 0}`,
	].join("|")
}

/** The closest distinct published role pair, in OKLab. Collapsed pairs are exact ties and are skipped. */
export function worstMargin(palette: Record<string, unknown>): { distance: number; pair: string } {
	let distance = Number.POSITIVE_INFINITY
	let pair = "none"
	for (let first = 0; first < ROLES.length; first += 1) {
		for (let second = first + 1; second < ROLES.length; second += 1) {
			const a = palette[ROLES[first]] as string
			const b = palette[ROLES[second]] as string
			if (a === b) continue
			const d = colorDistance(colorFromHex(a), colorFromHex(b))
			if (d < distance) {
				distance = d
				pair = `${ROLES[first]}/${ROLES[second]}`
			}
		}
	}
	return { distance, pair }
}

const classNames = [...new Set(rows.map(classOf))]
const membersOf = new Map(classNames.map((name) => [name, rows.filter((row) => classOf(row) === name)]))

/** Population descending, then the class's first cover's sorted path. Sort first, cut after. */
const rankedClasses = classNames.slice().sort((first, second) => {
	const a = membersOf.get(first)!
	const b = membersOf.get(second)!
	return b.length - a.length || (a[0].imagePath < b[0].imagePath ? -1 : a[0].imagePath > b[0].imagePath ? 1 : 0)
})

type Swap = { className: string; skipped: string; distance: number; pair: string; takenInstead: string | null }
const swaps: Swap[] = []
const selected: { row: Row; className: string; margin: { distance: number; pair: string } }[] = []
const skippedClasses: string[] = []

for (const className of rankedClasses) {
	if (selected.length === ITEM_COUNT) {
		skippedClasses.push(className)
		continue
	}
	const members = membersOf.get(className)!
	let taken: (typeof selected)[number] | null = null
	for (const row of members) {
		const margin = worstMargin(row.palette as unknown as Record<string, unknown>)
		if (margin.distance >= MARGIN_FLOOR) {
			taken = { row, className, margin }
			break
		}
		swaps.push({ className, skipped: row.imagePath, distance: margin.distance, pair: margin.pair, takenInstead: null })
	}
	if (taken === null) {
		skippedClasses.push(`${className} (every cover under the margin floor)`)
		continue
	}
	for (const swap of swaps) if (swap.className === className && swap.takenInstead === null) swap.takenInstead = taken.row.imagePath
	selected.push(taken)
}

if (selected.length !== ITEM_COUNT) {
	throw new Error(`selection produced ${selected.length} items, expected ${ITEM_COUNT}`)
}

/** Presentation order: sorted by image path, like every other ordering in this file. */
selected.sort((first, second) =>
	first.row.imagePath < second.row.imagePath ? -1 : first.row.imagePath > second.row.imagePath ? 1 : 0,
)

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

/** Deterministic slug from the image basename: lowercased, every non-alphanumeric run → one dash. */
function slugOf(imagePathRelative: string): string {
	const base = imagePathRelative.split("/").pop() ?? imagePathRelative
	const stem = base.replace(/\.[^.]+$/, "")
	return stem.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

const items = selected.map(({ row }) => {
	const palette = row.palette!
	return {
		itemId: slugOf(row.imagePath),
		imagePath: row.imagePath,
		collection: "coverage-set-1",
		variantId: VARIANT_ID,
		palette: {
			background: palette.background,
			surface: palette.surface,
			foreground: palette.foreground,
			accent: palette.accent,
			gradient: palette.gradient,
			surfaceCollapsed: palette.surfaceCollapsed,
			accentCollapsed: palette.accentCollapsed,
		},
		fingerprint: {
			algorithmVersion: BLINDED_ALGORITHM_VERSION,
			preprocessingVersion: palette.preprocessingVersion,
			gitCommit,
			dirty,
		},
	}
})

for (const item of items) if (!existsSync(join(ROOT, item.imagePath))) throw new Error(`image missing on disk: ${item.imagePath}`)

writeFileSync(join(HERE, "items.json"), `${JSON.stringify(items, null, "\t")}\n`)

/** Every published field colour that is also the representative of an enclosure-shaped field node. */
function enclosureSurfaceNodes(row: Row) {
	return (row.fieldRoleNodes ?? []).filter((node) => node.role === "surface" && node.enclosure && node.kind === "field")
}

writeFileSync(
	join(HERE, "mapping.private.json"),
	`${JSON.stringify(
		{
			_note: "NOT SERVABLE. The decode key and the whole selection state of round-3-quality.",
			_roundId: "p2-round-3-quality",
			_variants: {
				[VARIANT_ID]: {
					candidateId: "p2-tos",
					family: "tree of shapes",
					candidatePath: "research/v3/prototypes/p2-tree/tos/candidate.ts",
					algorithmVersion: selected[0].row.palette!.algorithmVersion,
					runFile: `review-rounds/round-3-quality/${RUN_FILE}`,
				},
			},
			_pool: {
				source: "research/v3/data/coverage-set/coverage-set-1.json",
				excluded: ["research/v3/data/devloop/sets/demo-20.txt", "prototypes/p2-tree/falsifier/out/endorsed-173.txt"],
				runSet: "review-rounds/round-3-quality/fresh-40.txt",
				ran: allRows.length,
				failed: failedRows.map((row) => ({ imagePath: row.imagePath, error: row.error })),
			},
			_classes: {
				rule: "population descending, ties by the class's first cover's sorted path; representative is the class's first cover by sorted path clearing the margin floor",
				marginFloor: MARGIN_FLOOR,
				population: Object.fromEntries(rankedClasses.map((name) => [name, membersOf.get(name)!.length])),
				taken: selected.map((entry) => entry.className),
				skipped: skippedClasses,
				swaps,
			},
			_items: Object.fromEntries(
				selected.map((entry) => {
					const enclosures = enclosureSurfaceNodes(entry.row)
					return [
						slugOf(entry.row.imagePath),
						{
							imagePath: entry.row.imagePath,
							class: entry.className,
							verdict: entry.row.verdict,
							laminarity: entry.row.laminarity,
							coverage: entry.row.coverage,
							nodeCount: entry.row.nodeCount,
							textGroupCount: entry.row.textGroupCount,
							margin: entry.margin,
							publishedSurfaceIsEnclosureShaped: enclosures.length > 0,
							enclosureSurfaceNodes: enclosures,
							enclosureFieldNodeCount: entry.row.enclosureFieldNodeCount,
							assembly: entry.row.assembly,
						},
					]
				}),
			),
		},
		null,
		"\t",
	)}\n`,
)

for (const entry of selected) {
	const enclosures = enclosureSurfaceNodes(entry.row)
	console.log(
		[
			slugOf(entry.row.imagePath).slice(0, 14),
			entry.className.padEnd(30),
			`margin=${entry.margin.distance.toFixed(4)} (${entry.margin.pair})`,
			`encSurface=${enclosures.length > 0 ? "yes" : "no"}`,
			entry.row.imagePath,
		].join(" | "),
	)
}
console.log(`ran=${allRows.length} failed=${failedRows.length} classes=${classNames.length} swaps=${swaps.length}`)
console.log(`gitCommit=${gitCommit} dirty=${dirty}`)
console.log(`wrote ${items.length} items`)
