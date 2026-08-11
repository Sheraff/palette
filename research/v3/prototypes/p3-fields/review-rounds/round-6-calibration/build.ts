/**
 * Round 6 (calibration) — stage the eight selected items.
 *
 * No palette is recomputed here. Two runs of the same candidate at the same commit feed this round,
 * and every item is a row of one of them, copied verbatim:
 *
 *   - `run-coverage-220-0.4.2.jsonl` — `p3-fields-0.4.2` at `b9c41a4` over `coverage-set-1-220`.
 *     Seven of the eight items are rows of this run, and every rate `ROUND.md` quotes is over its 220.
 *   - `run-demo-20-0.4.2.jsonl` — the same candidate, same commit, over `demo-20`. It supplies **one**
 *     row: cover 19 (`…0000269ead63cf2376a6b67d`) is a `demo-20` cover and is **not** a member of
 *     `coverage-set-1-220` (checked against the set file, not assumed). It is a re-grade of a round-1
 *     item, so the fresh-cover rule — which draws beyond demo-20 — has nothing to say about it; but its
 *     palette has to come from a run that contains it.
 *
 * Each run has a `--no-cache`, `P3_DIAG`-on twin (`run-*-0.4.2-diag.jsonl`, `diag-*-0.4.2/`).
 * `verify.ts` check 9 requires all 240 rows to be palette-identical across the pairs, which is the
 * determinism claim checked rather than cited. The diagnostics chains are where every min-ramp, chroma,
 * departure and edge-fraction number in `ROUND.md` comes from; `select.ts` is the reader.
 *
 * Writes the two reviewer-facing files:
 *
 *   - `items.jsonl`        — one item per line, palette hexes copied verbatim from the run rows.
 *   - `sidecar.data.json`  — the render side-car, keyed by itemId. BLINDED: no prototype name, no arm
 *                            label, no mechanism text, and no hint of which class an item is in.
 *                            Built by `src/devloop/side.ts`, the one `colornames-oklab` call site and
 *                            the one `[REVIEWED]` gradient display mapping, so the reviewer sees what
 *                            the mock renders. `verify.ts` check 10 greps it for leaks.
 *
 *   node --experimental-strip-types research/v3/prototypes/p3-fields/review-rounds/round-6-calibration/build.ts
 */

import { readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { sideFromPalette } from "../../../../src/devloop/side.ts"
import type { Palette } from "../../../../src/contract/types.ts"

const HERE = dirname(fileURLToPath(import.meta.url))

/** The main checkout — where a repo-relative corpus path resolves for the consumer of this round. */
const MAIN_CHECKOUT = "/Users/Flo/GitHub/palette"

/** This worktree. Both runs executed here, so every recorded path carries this prefix. */
const WORKTREE = "/Users/Flo/GitHub/palette/.worktrees/p3-fields"

/**
 * The eight items, in the round's row order.
 *
 * **`itemId` is the ARTWORK CONTENT STEM** — `basename(imagePath)` with any extension removed, and
 * nothing else (`QUEUE.md`, the staging convention adopted at the round-4 install). No run ordinal
 * appears anywhere. `verify.ts` check 8 asserts the id equals the stem rather than trusting this table.
 *
 * **Row order interleaves the three selection classes on purpose** — C R C R F R C R. Three of these
 * covers are here because their published foreground is barely legible, and a reviewer who worked out
 * that three consecutive covers were all "hard-to-read text" covers would be grading a pattern rather
 * than a palette. Nothing served says which class an item is in; the table lives in `ROUND.md`, which
 * is never served. Row 5 is in two classes at once and is placed as a re-grade.
 *
 * `key` is the run's own zero-based index, which is also the set file's line order.
 */
const SELECTED: readonly Readonly<{ run: "coverage" | "demo"; key: number; itemClass: string }>[] = [
	{ run: "coverage", key: 163, itemClass: "conflict:min-ramp-3.27-highest-chroma" },
	{ run: "coverage", key: 168, itemClass: "re-grade:168-blue-now-accent" },
	{ run: "coverage", key: 16, itemClass: "conflict:min-ramp-4.93-mildest" },
	{ run: "coverage", key: 90, itemClass: "re-grade:purple-shade" },
	{ run: "coverage", key: 202, itemClass: "fresh:highest-edge-fraction" },
	{ run: "coverage", key: 39, itemClass: "re-grade:039-magenta + conflict:min-ramp-3.07" },
	{ run: "coverage", key: 170, itemClass: "conflict:min-ramp-2.67-worst" },
	{ run: "demo", key: 19, itemClass: "re-grade:cover-19-accent-regression" },
]

/**
 * The fingerprint of the code that produced these palettes.
 *
 * `b9c41a4` is the candidate commit and both runs executed against that tree: `git status --short` over
 * `research/v3/prototypes/p3-fields/src` and `research/v3/src` is empty, and both run headers carry the
 * same `codeVersion` (`a5f17f31…`), which is the value the committed tree produces. `dirty` is therefore
 * checkable rather than asserted.
 */
const FINGERPRINT = {
	algorithmVersion: "p3-fields-0.4.2",
	preprocessingVersion: "sharp-0.33.5/srgb/no-resample/alpha-excluded",
	gitCommit: "b9c41a4",
	dirty: false,
} as const

/** The TRUE name of the single side shown. Never served — the side-car below is blinded. */
const VARIANT_ID = "p3-fields-0.4.2"

type RunRow = Readonly<{ kind: string; index: number; imagePath: string; ok: boolean; palette: Palette }>

function readRun(file: string): Map<number, RunRow> {
	const rows = new Map<number, RunRow>()
	for (const line of readFileSync(join(HERE, file), "utf8").trim().split("\n")) {
		const row = JSON.parse(line) as RunRow
		if (row.kind !== "devloop-run-row") continue
		rows.set(row.index, row)
	}
	return rows
}

const RUNS = {
	coverage: readRun("run-coverage-220-0.4.2.jsonl"),
	demo: readRun("run-demo-20-0.4.2.jsonl"),
} as const

/**
 * Repo-relative, as the MAIN checkout resolves it.
 *
 * The runs executed inside the worktree, whose corpus shards and `music-artworks/` are symlinks back to
 * the main checkout, so every recorded path carries the worktree prefix. Strip exactly that prefix.
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

for (const { run, key, itemClass } of SELECTED) {
	const row = RUNS[run].get(key)
	if (row === undefined) throw new Error(`${run} run has no row ${key}`)
	if (!row.ok) throw new Error(`${run} row ${key} did not succeed`)

	const palette = row.palette
	const relative = repoRelative(row.imagePath)
	const itemId = basename(relative).replace(/\.[a-z0-9]+$/iu, "")
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
			// a grep of one line says which criterion the item is serving, and which run it came from.
			selectionClass: itemClass,
			sourceRun: run,
		}),
	)

	sidecar[itemId] = sideFromPalette(palette)
}

writeFileSync(join(HERE, "items.jsonl"), `${itemLines.join("\n")}\n`)
writeFileSync(join(HERE, "sidecar.data.json"), `${JSON.stringify(sidecar, null, "\t")}\n`)

console.log(`${itemLines.length} items written; main checkout = ${MAIN_CHECKOUT}`)
