/**
 * Round 5 (calibration) — stage the nine selected items.
 *
 * One run feeds this round and no palette is recomputed here:
 *
 *   - `run-coverage-220-0.4.1.jsonl` — the candidate at `9504846` over `coverage-set-1-220`, produced
 *     by this round. Every one of the nine items is a row of it, copied verbatim.
 *
 * A second execution over the same set — `--no-cache`, `P3_DIAG` **on** — is in
 * `run-coverage-220-0.4.1-diag.jsonl`; `verify.ts` check 9 requires all 220 rows to be
 * palette-identical between the two, which is the determinism claim checked rather than cited. The
 * diagnostics chain that run wrote (`diag-coverage-0.4.1/`) is where every regime, edge fraction and
 * step count quoted in `ROUND.md` comes from, and `accent-support-0.4.1.json` (written by
 * `accent-support.ts`) is where every support/fill/route number comes from.
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
 *   node --experimental-strip-types research/v3/prototypes/p3-fields/review-rounds/round-5-calibration/build.ts
 */

import { readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { sideFromPalette } from "../../../../src/devloop/side.ts"
import type { Palette } from "../../../../src/contract/types.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const RUN = join(HERE, "run-coverage-220-0.4.1.jsonl")

/** The main checkout — where a repo-relative corpus path resolves for the consumer of this round. */
const MAIN_CHECKOUT = "/Users/Flo/GitHub/palette"

/** This worktree. The run executed here, so every recorded path carries this prefix. */
const WORKTREE = "/Users/Flo/GitHub/palette/.worktrees/p3-fields"

/**
 * The nine items, in the round's row order.
 *
 * **`itemId` is the ARTWORK CONTENT STEM** — `basename(imagePath)` with any extension removed, and
 * nothing else (`QUEUE.md`, the staging convention adopted at the round-4 install). No run ordinal
 * appears anywhere: the ordinal is a fact about *this* run's set file and would be meaningless to the
 * installer, to the warehouse, and to anyone reading two rounds together. `verify.ts` check 8 asserts
 * the id equals the stem rather than trusting this table.
 *
 * **Row order interleaves the three selection classes on purpose** — A N F A N A F N A. The classes
 * are the round's whole design and a reviewer who worked out that four consecutive covers were all
 * "small chromatic mark" covers would be grading a pattern rather than a palette. Nothing served says
 * which class an item is in; the table lives in `ROUND.md`, which is never served.
 *
 * `key` is the run's own zero-based index, which is also the set file's line order.
 */
const SELECTED: readonly Readonly<{ key: number; itemClass: string }>[] = [
	{ key: 92, itemClass: "newly-admitted-accent:lowest-support" },
	{ key: 90, itemClass: "named-mark:purple" },
	{ key: 167, itemClass: "fresh:busy-photographic" },
	{ key: 160, itemClass: "newly-admitted-accent:lowest-fill" },
	{ key: 130, itemClass: "named-mark:cinnamon" },
	{ key: 0, itemClass: "newly-admitted-accent:low-fill-high-support" },
	{ key: 43, itemClass: "fresh:ink-regime" },
	{ key: 168, itemClass: "named-mark:blue-family-role-assignment" },
	{ key: 64, itemClass: "newly-admitted-accent:highest-support-concentrated" },
]

/**
 * The fingerprint of the code that produced these palettes.
 *
 * `9504846` is the candidate commit and the run executed against that tree: `git status --short` over
 * `research/v3/prototypes/p3-fields/src` and `research/v3/src` is empty, and the run header's
 * `codeVersion` (`715a729d…`) is the one the committed tree produces — the same value
 * `../../measurements/run-adjudicated-197-0.4.1.jsonl` recorded independently. `dirty` is therefore
 * checkable rather than asserted.
 */
const FINGERPRINT = {
	algorithmVersion: "p3-fields-0.4.1",
	preprocessingVersion: "sharp-0.33.5/srgb/no-resample/alpha-excluded",
	gitCommit: "9504846",
	dirty: false,
} as const

/** The TRUE name of the single side shown. Never served — the side-car below is blinded. */
const VARIANT_ID = "p3-fields-0.4.1"

type RunRow = Readonly<{ kind: string; index: number; imagePath: string; ok: boolean; palette: Palette }>

const rows = new Map<number, RunRow>()
for (const line of readFileSync(RUN, "utf8").trim().split("\n")) {
	const row = JSON.parse(line) as RunRow
	if (row.kind !== "devloop-run-row") continue
	rows.set(row.index, row)
}

/**
 * Repo-relative, as the MAIN checkout resolves it.
 *
 * The run executed inside the worktree, whose corpus shards and `music-artworks/` are symlinks back to
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

for (const { key, itemClass } of SELECTED) {
	const row = rows.get(key)
	if (row === undefined) throw new Error(`run has no row ${key}`)
	if (!row.ok) throw new Error(`row ${key} did not succeed`)

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
			// a grep of one line says which criterion the item is serving.
			selectionClass: itemClass,
		}),
	)

	sidecar[itemId] = sideFromPalette(palette)
}

writeFileSync(join(HERE, "items.jsonl"), `${itemLines.join("\n")}\n`)
writeFileSync(join(HERE, "sidecar.data.json"), `${JSON.stringify(sidecar, null, "\t")}\n`)

console.log(`${itemLines.length} items written; main checkout = ${MAIN_CHECKOUT}`)
