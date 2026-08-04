/**
 * Round 2 (calibration) — stage the nine selected items.
 *
 * Two runs feed this round, and neither palette is recomputed here:
 *
 *   - `run-regrade-4-0.3.0.jsonl` — the candidate at `bead404` over the four round-1 covers that
 *     round 2 re-grades. Produced by this round (`regrade-4.txt` is its set file); round 1's own run
 *     is `p3-fields-0.2.0` and cannot answer a question about 0.3.0.
 *   - `../../measurements/run-coverage-220-0.3.0.jsonl` — W9's coverage-set-1 breadth run, the source
 *     of the five fresh covers. Drawn from beyond `demo-20` per the fresh-cover overfitting rule
 *     (`../../EVIDENCE_2026-08-04.md` item 9); `coverage-set-1` and `demo-20` are disjoint sets.
 *
 * Writes the two reviewer-facing files:
 *
 *   - `items.jsonl`        — one item per line, palette hexes copied verbatim from the run rows.
 *   - `sidecar.data.json`  — the render side-car, keyed by itemId. BLINDED: no prototype name, no arm
 *                            label, no mechanism text, and no hint of which items are re-grades.
 *                            Built by `src/devloop/side.ts`, the one `colornames-oklab` call site and
 *                            the one `[REVIEWED]` gradient display mapping, so the reviewer sees what
 *                            the mock renders.
 *
 *   node --experimental-strip-types research/v3/prototypes/p3-fields/review-rounds/round-2-calibration/build.ts
 */

import { readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { sideFromPalette } from "../../../../src/devloop/side.ts"
import type { Palette } from "../../../../src/contract/types.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const REGRADE_RUN = join(HERE, "run-regrade-4-0.3.0.jsonl")
const COVERAGE_RUN = join(HERE, "..", "..", "measurements", "run-coverage-220-0.3.0.jsonl")

/** The main checkout — where a repo-relative corpus path resolves for the consumer of this round. */
const MAIN_CHECKOUT = "/Users/Flo/GitHub/palette"

/** This worktree. Both runs executed here, so both recorded absolute paths carry this prefix. */
const WORKTREE = "/Users/Flo/GitHub/palette/.worktrees/p3-fields"

/**
 * The nine items, in the round's row order.
 *
 * **`itemId` is round-scoped and carries nothing.** Round 1's ids were the demo-20 run index, and
 * four of this round's covers are round-1 covers — reusing `item-00` for a *different* palette of the
 * *same* cover is the one naming mistake that would make two batches impossible to read together. So
 * the ids are `r2-item-N`, N is the row position, and the provenance table lives in `ROUND.md`, which
 * is never served.
 *
 * **Row order interleaves the two provenances on purpose** (fresh at 0/2/4/6/8, re-grade at 1/3/5/7).
 * A reviewer who noticed that the first four items were all covers they had seen before would be
 * grading with a memory of their own earlier grade in hand, which is exactly what a re-grade must not
 * buy. Nothing served says which is which.
 *
 * `source` names the run; `key` is the run's own zero-based index for the coverage run, and the image
 * basename for the four-cover re-grade run (whose row order is the set file's, not a corpus index).
 */
const SELECTED: readonly Readonly<{
	itemId: string
	source: "coverage" | "regrade"
	key: number | string
	itemClass: string
}>[] = [
	{ itemId: "r2-item-0", source: "coverage", key: 172, itemClass: "busy-salience-risk" },
	{ itemId: "r2-item-1", source: "regrade", key: "ab67616d00001e02000001335fe604d859a69094.jpg", itemClass: "regrade-ink-lump" },
	{ itemId: "r2-item-2", source: "coverage", key: 14, itemClass: "swap-tie-margin" },
	{ itemId: "r2-item-3", source: "regrade", key: "ab67616d00001e020000269ead63cf2376a6b67d.jpg", itemClass: "regrade-swap" },
	{ itemId: "r2-item-4", source: "coverage", key: 90, itemClass: "gradient-far-above-rho-star" },
	{ itemId: "r2-item-5", source: "regrade", key: "00007e976f2fb1819d1ec7e0cc2869f39d397ba3.jpg", itemClass: "regrade-ink-contrast" },
	{ itemId: "r2-item-6", source: "coverage", key: 89, itemClass: "ink-low-contrast-identity" },
	{ itemId: "r2-item-7", source: "regrade", key: "ab67616d00001e0200000f92552b0935b967964d.jpg", itemClass: "regrade-accent" },
	{ itemId: "r2-item-8", source: "coverage", key: 170, itemClass: "swap-wide-margin" },
]

/**
 * The fingerprint of the code that produced these palettes.
 *
 * `bead404` is the candidate commit. The measurements were taken at `2ccb19b` (the W9 re-measure
 * commit) whose `src/` is byte-identical to `bead404`'s — `git diff bead404 2ccb19b -- src/` is
 * empty — so the palettes are a statement about `bead404` and are fingerprinted as one. `dirty` is
 * false because the run's own `codeVersion` (the dev-loop module-graph hash) is the same
 * `1cc28c1e…` the committed tree produces.
 */
const FINGERPRINT = {
	algorithmVersion: "p3-fields-0.3.0",
	preprocessingVersion: "sharp-0.33.5/srgb/no-resample/alpha-excluded",
	gitCommit: "bead404",
	dirty: false,
} as const

/** The TRUE name of the single side shown. Never served — the side-car below is blinded. */
const VARIANT_ID = "p3-fields-0.3.0"

type RunRow = Readonly<{ kind: string; index: number; imagePath: string; ok: boolean; palette: Palette }>

function readRun(path: string): RunRow[] {
	return readFileSync(path, "utf8")
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line) as RunRow)
		.filter((row) => row.kind === "devloop-run-row")
}

const coverage = new Map<number, RunRow>()
for (const row of readRun(COVERAGE_RUN)) coverage.set(row.index, row)

const regrade = new Map<string, RunRow>()
for (const row of readRun(REGRADE_RUN)) regrade.set(basename(row.imagePath), row)

/**
 * Repo-relative, as the MAIN checkout resolves it.
 *
 * Both runs executed inside the worktree, whose corpus shards and `music-artworks/` are symlinks back
 * to the main checkout, so every recorded path carries the worktree prefix. Strip exactly that prefix
 * — round 1's "last two segments" rule was written for `00/<file>` and silently truncates
 * `music-artworks/4/3/7/<file>` to `7/<file>`, which resolves to nothing.
 */
function repoRelative(absolutePath: string): string {
	if (!absolutePath.startsWith(`${WORKTREE}/`)) throw new Error(`not a worktree path: ${absolutePath}`)
	return absolutePath.slice(WORKTREE.length + 1)
}

/** `deriveCollection` from `src/review-server/batch.ts`, applied to the repo-relative path. */
const SHARD_PATTERN = /^[0-9a-f]{2}$/u
function collectionOf(repoRelativePath: string): string {
	if (repoRelativePath.startsWith("music-artworks/")) return "music-artworks"
	const parent = basename(dirname(repoRelativePath))
	return SHARD_PATTERN.test(parent) ? "sharded-corpus" : parent
}

const itemLines: string[] = []
const sidecar: Record<string, unknown> = {}

for (const { itemId, source, key, itemClass } of SELECTED) {
	const row = source === "coverage" ? coverage.get(key as number) : regrade.get(key as string)
	if (row === undefined) throw new Error(`${source} run has no row ${String(key)}`)
	if (!row.ok) throw new Error(`row ${String(key)} did not succeed`)

	const palette = row.palette
	const relative = repoRelative(row.imagePath)
	const gradient =
		palette.gradient === null
			? null
			: { stops: palette.gradient.stops.map((stop) => ({ color: stop.color.hex, position: stop.position })) }

	itemLines.push(
		JSON.stringify({
			itemId,
			imagePath: relative,
			collection: collectionOf(relative),
			artworkId: null,
			variantId: VARIANT_ID,
			background: palette.roles.background.hex,
			surface: palette.roles.surface.hex,
			foreground: palette.roles.foreground.hex,
			accent: palette.roles.accent.hex,
			gradient,
			surfaceCollapsed: palette.collapse.surfaceCollapsed,
			accentCollapsed: palette.collapse.accentCollapsed,
			fingerprint: FINGERPRINT,
			// Not part of the push shape — the orchestrator's per-class read of the round. Kept here so
			// a grep of one line says which criterion the item is serving.
			selectionClass: itemClass,
		}),
	)

	sidecar[itemId] = sideFromPalette(palette)
}

writeFileSync(join(HERE, "items.jsonl"), `${itemLines.join("\n")}\n`)
writeFileSync(join(HERE, "sidecar.data.json"), `${JSON.stringify(sidecar, null, "\t")}\n`)

console.log(`${itemLines.length} items written; main checkout = ${MAIN_CHECKOUT}`)
