/**
 * Round 1 (calibration) — stage the eight selected items.
 *
 * Reads `run-demo-20-0.2.0.jsonl` (the candidate's own dev-loop run over `demo-20`, produced by
 * `src/devloop/run.ts` at commit cb760d7) and writes the two reviewer-facing files:
 *
 *   - `items.jsonl`        — one item per line, palette hexes copied verbatim from the run rows.
 *   - `sidecar.data.json`  — the render side-car, keyed by itemId. BLINDED: no prototype name, no
 *                            arm label, no mechanism text. Built by `src/devloop/side.ts`, which is
 *                            the one `colornames-oklab` call site and the one `[REVIEWED]` gradient
 *                            display mapping — so the reviewer sees exactly what the mock renders.
 *
 * Nothing here recomputes a palette. The run rows are the source of every hex.
 *
 *   node --experimental-strip-types research/v3/prototypes/p3-fields/review-rounds/round-1-calibration/build.ts
 */

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { sideFromPalette } from "../../../../src/devloop/side.ts"
import type { Palette } from "../../../../src/contract/types.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const RUN = join(HERE, "run-demo-20-0.2.0.jsonl")

/** The main checkout — where a repo-relative corpus path resolves. */
const MAIN_CHECKOUT = "/Users/Flo/GitHub/palette"

/**
 * The eight selected items, by the run's own zero-based `index`.
 *
 * `class` is the stated selection criterion the item is there to serve; `ROUND.md` carries the full
 * table with regime and gradient. Index 01 (the all-black monochrome, foreground = background) is
 * excluded — a contract-failing palette is not a question for a reviewer.
 */
const SELECTED: readonly Readonly<{ index: number; itemClass: string }>[] = [
	{ index: 0, itemClass: "ink-regime-text" },
	{ index: 2, itemClass: "gradient-published" },
	{ index: 5, itemClass: "busy-photographic" },
	{ index: 7, itemClass: "luminance-no-text" },
	{ index: 11, itemClass: "gradient-published" },
	{ index: 12, itemClass: "ink-regime-text" },
	{ index: 14, itemClass: "near-neutral-high-contrast" },
	{ index: 19, itemClass: "ink-regime-text" },
]

/** The fingerprint of the code that produced these palettes. */
const FINGERPRINT = {
	algorithmVersion: "p3-fields-0.2.0",
	preprocessingVersion: "native-decode-1",
	gitCommit: "cb760d7",
	dirty: false,
} as const

/** The TRUE name of the single side shown. Never served — the side-car below is blinded. */
const VARIANT_ID = "p3-fields-0.2.0"

type RunRow = Readonly<{ kind: string; index: number; imagePath: string; ok: boolean; palette: Palette }>

const rows = new Map<number, RunRow>()
for (const line of readFileSync(RUN, "utf8").trim().split("\n")) {
	const parsed = JSON.parse(line) as RunRow
	if (parsed.kind === "devloop-run-row") rows.set(parsed.index, parsed)
}

/**
 * Repo-relative, as the MAIN checkout resolves it.
 *
 * The run was executed inside the worktree, where the corpus shards are symlinks back to the main
 * checkout, so the recorded absolute path carries a `.worktrees/p3-fields/` prefix that means
 * nothing to a consumer. Strip it back to `00/<file>`.
 */
function repoRelative(absolutePath: string): string {
	const match = /\/(?:[0-9a-f]{2}|music-artworks)\/[^/]+$/u.exec(absolutePath)
	if (match === null) throw new Error(`cannot make repo-relative: ${absolutePath}`)
	return match[0].slice(1)
}

const itemLines: string[] = []
const sidecar: Record<string, unknown> = {}

for (const { index, itemClass } of SELECTED) {
	const row = rows.get(index)
	if (row === undefined) throw new Error(`run has no row ${index}`)
	if (!row.ok) throw new Error(`row ${index} did not succeed`)

	// `item-NN` carries the run's own zero-based index, so "#14" in a report and `item-14` here are
	// the same cover. The `item-` prefix is not decoration: bare "00".."19" are a mix of
	// integer-like and non-integer-like JSON keys, and an object holding both is serialized in an
	// order no reader expects.
	const itemId = `item-${String(index).padStart(2, "0")}`
	const palette = row.palette
	const gradient =
		palette.gradient === null
			? null
			: { stops: palette.gradient.stops.map((stop) => ({ color: stop.color.hex, position: stop.position })) }

	itemLines.push(
		JSON.stringify({
			itemId,
			imagePath: repoRelative(row.imagePath),
			collection: "sharded-corpus",
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
			// Not part of the push shape — the orchestrator's per-class read of the round. Kept here
			// so a grep of one line says which criterion the item is serving.
			selectionClass: itemClass,
		}),
	)

	sidecar[itemId] = sideFromPalette(palette)
}

writeFileSync(join(HERE, "items.jsonl"), `${itemLines.join("\n")}\n`)
writeFileSync(join(HERE, "sidecar.data.json"), `${JSON.stringify(sidecar, null, "\t")}\n`)

console.log(`${itemLines.length} items written; main checkout = ${MAIN_CHECKOUT}`)
