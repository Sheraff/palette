/**
 * Build the round-1 fixture: `items.json` (blinded, servable) + `mapping.private.json` (the decode).
 *
 * Deterministic by construction. Every input is a file already on disk — the two most recent
 * dev-loop runs over `demo-20` and the tree-of-shapes node dump — and every ordering in the output
 * is a sort over a value read from those files (image path, then item index). Nothing here reads a
 * clock, a hash of a filename, or a map's iteration order.
 *
 *   node --experimental-strip-types build.ts
 *
 * Re-running it must reproduce both files byte-for-byte as long as the run files, the node dump and
 * `git rev-parse HEAD` are unchanged.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { join } from "node:path"

const HERE = import.meta.dirname
/** `research/v3/prototypes/p2-tree/review-rounds/round-1-tree-families` → the worktree root. */
const ROOT = join(HERE, "..", "..", "..", "..", "..", "..")

/**
 * The two runs this fixture is cut from — the LATEST run of each candidate over `demo-20`.
 *
 * Pinned by filename rather than discovered by "newest mtime" so the fixture is reproducible after
 * anyone adds another run to the directory. Both were verified to be one of three byte-identical
 * re-runs of their code version, which is where the determinism claim comes from.
 */
const RUNS = {
	v1: "p2-alpha-demo-20-20260804T171812541Z.jsonl",
	v2: "p2-tos-demo-20-20260804T171511526Z.jsonl",
} as const

/**
 * Blinded variant labels. `v1`/`v2` are ARBITRARY handles, decodable only through
 * `mapping.private.json`; nothing in `items.json` says which tree family either one is.
 */
const VARIANT_ID = {
	v1: "p2-tree-cycle1-v1",
	v2: "p2-tree-cycle1-v2",
} as const

/**
 * The algorithm version written into the fixture, per variant.
 *
 * NOT the pipeline's own `metadata.algorithmVersion` — those strings are `p2-alpha-0.1.0` and
 * `p2-tos-0.1.0-cycle-1`, i.e. they name the candidate outright, and the round's blinding rule is
 * that no candidate id appears anywhere in `items.json`. The true versions are recorded verbatim in
 * `mapping.private.json` next to the candidate ids, so nothing is lost — it is moved.
 */
const BLINDED_ALGORITHM_VERSION = {
	v1: "p2-tree-cycle1-0.1.0-v1",
	v2: "p2-tree-cycle1-0.1.0-v2",
} as const

type VariantKey = keyof typeof RUNS

type Rgb = readonly [number, number, number]
type Color = { rgb: Rgb; hex: string }
type RunRow = {
	kind: string
	index: number
	imagePath: string
	ok: boolean
	palette: {
		roles: { background: Color; surface: Color; foreground: Color; accent: Color }
		gradient: null | { stops: { color: Color; position: number }[] }
		collapse: { surfaceCollapsed: boolean; accentCollapsed: boolean }
		metadata: { algorithmVersion: string; preprocessingVersion: string }
	}
}

function readJsonl(path: string): Record<string, unknown>[] {
	return readFileSync(path, "utf8")
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line) as Record<string, unknown>)
}

function rowsOf(variant: VariantKey): { header: Record<string, unknown>; rows: Map<string, RunRow> } {
	const lines = readJsonl(join(ROOT, "research/v3/data/devloop/runs", RUNS[variant]))
	const header = lines.find((l) => l.kind === "devloop-run-header")
	if (!header) throw new Error(`${RUNS[variant]}: no header line`)
	const rows = lines.filter((l) => l.kind === "devloop-run-row") as unknown as RunRow[]
	const failed = rows.filter((r) => !r.ok)
	if (failed.length > 0) throw new Error(`${RUNS[variant]}: ${failed.length} failed rows — refusing to stage`)
	return { header, rows: new Map(rows.map((r) => [r.imagePath, r])) }
}

/** `00/<name>.jpg` — the form the set file uses, which is the form the fixture publishes. */
function repoRelative(absolute: string): string {
	const prefix = ROOT.endsWith("/") ? ROOT : ROOT + "/"
	if (!absolute.startsWith(prefix)) throw new Error(`image path outside the worktree: ${absolute}`)
	return absolute.slice(prefix.length)
}

/** Deterministic slug from the image basename: lowercased, every non-alphanumeric run → one dash. */
function slugOf(imagePathRelative: string): string {
	const base = imagePathRelative.split("/").pop() ?? imagePathRelative
	const stem = base.replace(/\.[^.]+$/, "")
	return stem.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

// ---------------------------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------------------------

const v1 = rowsOf("v1")
const v2 = rowsOf("v2")

/**
 * The field verdict per cover.
 *
 * Only the tree-of-shapes pipeline computes one, so its node dump is the class label for BOTH
 * sides — the classes name the COVER, not either reading of it. The dump was written at an earlier
 * code version than the run this fixture publishes (see `ROUND.md`); the verdicts and the gradient
 * set are identical across every tos run on disk, the role colours are not, so the dump is used for
 * `verdict` only and never for a colour.
 */
const verdicts = new Map<string, { verdict: string; coverage: number }>(
	readJsonl(join(ROOT, "research/v3/prototypes/p2-tree/tos/out/demo-20.nodes.jsonl")).map((n) => [
		n.imagePath as string,
		{ verdict: n.verdict as string, coverage: n.coverage as number },
	]),
)

// ---------------------------------------------------------------------------------------------
// Selection — 4 laminar + 1 flat + 1 textured + 1 partitioned + 1 unreadable
// ---------------------------------------------------------------------------------------------

/** Every demo-20 cover, sorted by repo-relative image path. Sort first, pick after. */
const universe = [...v1.rows.keys()]
	.map((absolute) => {
		const relative = repoRelative(absolute)
		const verdict = verdicts.get(absolute)
		if (!verdict) throw new Error(`no node-dump verdict for ${relative}`)
		return { absolute, relative, ...verdict }
	})
	.sort((a, b) => (a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0))

const byClass = (name: string) => universe.filter((u) => u.verdict === name)

const laminar = byClass("laminar")
const taken = new Set(laminar.map((u) => u.relative))
/** One representative per remaining class, taken FIRST BY SORTED PATH so the pick is not a choice. */
const singles = ["flat", "textured", "partitioned", "unreadable"].map((name) => {
	// An empty class falls through to the next unclaimed unreadable cover, per the round brief.
	const pool = byClass(name).length > 0 ? byClass(name) : byClass("unreadable")
	const pick = pool.find((u) => !taken.has(u.relative))
	if (!pick) throw new Error(`class ${name} has no unclaimed cover, and neither does unreadable`)
	taken.add(pick.relative)
	return pick
})

const selected = [...laminar, ...singles]
if (selected.length !== 8 || taken.size !== 8) throw new Error(`selection is not 8 distinct covers (got ${taken.size})`)

/** Presentation order: sorted by image path. The side alternation below keys off this index. */
selected.sort((a, b) => (a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0))

// ---------------------------------------------------------------------------------------------
// Fingerprint
// ---------------------------------------------------------------------------------------------

const gitCommit = execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).trim()

function dirtyFor(pipelineDir: string): boolean {
	const out = execFileSync("git", ["-C", ROOT, "status", "--porcelain", pipelineDir], { encoding: "utf8" })
	return out.trim().length > 0
}
const DIRTY = {
	v1: dirtyFor("research/v3/prototypes/p2-tree/alpha"),
	v2: dirtyFor("research/v3/prototypes/p2-tree/tos"),
} as const

const PREPROCESSING = {
	v1: [...v1.rows.values()][0]!.palette.metadata.preprocessingVersion,
	v2: [...v2.rows.values()][0]!.palette.metadata.preprocessingVersion,
} as const

const TRUE_ALGORITHM_VERSION = {
	v1: [...v1.rows.values()][0]!.palette.metadata.algorithmVersion,
	v2: [...v2.rows.values()][0]!.palette.metadata.algorithmVersion,
} as const

// ---------------------------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------------------------

function paletteOf(variant: VariantKey, absolute: string) {
	const row = (variant === "v1" ? v1 : v2).rows.get(absolute)
	if (!row) throw new Error(`${variant}: no row for ${absolute}`)
	const p = row.palette
	return {
		background: p.roles.background.hex,
		surface: p.roles.surface.hex,
		foreground: p.roles.foreground.hex,
		accent: p.roles.accent.hex,
		gradient: p.gradient === null ? null : { stops: p.gradient.stops.map((s) => ({ color: s.color.hex, position: s.position })) },
		surfaceCollapsed: p.collapse.surfaceCollapsed,
		accentCollapsed: p.collapse.accentCollapsed,
	}
}

function sideOf(variant: VariantKey, absolute: string) {
	return {
		variantId: VARIANT_ID[variant],
		palette: paletteOf(variant, absolute),
		fingerprint: {
			algorithmVersion: BLINDED_ALGORITHM_VERSION[variant],
			preprocessingVersion: PREPROCESSING[variant],
			gitCommit,
			dirty: DIRTY[variant],
		},
	}
}

const items: unknown[] = []
const mapping: Record<string, { A: string; B: string }> = {}
const selectionRows: { itemId: string; imagePath: string; verdict: string; coverage: number; A: VariantKey; B: VariantKey }[] = []

selected.forEach((cover, index) => {
	const itemId = slugOf(cover.relative)
	// Side alternation by item-index parity: neither position is a candidate. A reader of
	// items.json can see that the sides alternate; nothing tells them which family is which.
	const [aKey, bKey]: [VariantKey, VariantKey] = index % 2 === 0 ? ["v1", "v2"] : ["v2", "v1"]
	items.push({
		itemId,
		imagePath: cover.relative,
		collection: "demo-20",
		sides: [sideOf(aKey, cover.absolute), sideOf(bKey, cover.absolute)],
	})
	mapping[itemId] = { A: aKey === "v1" ? "p2-alpha" : "p2-tos", B: bKey === "v1" ? "p2-alpha" : "p2-tos" }
	selectionRows.push({ itemId, imagePath: cover.relative, verdict: cover.verdict, coverage: cover.coverage, A: aKey, B: bKey })
})

for (const item of items as { imagePath: string }[]) {
	if (!existsSync(join(ROOT, item.imagePath))) throw new Error(`image missing on disk: ${item.imagePath}`)
}

writeFileSync(join(HERE, "items.json"), JSON.stringify(items, null, "\t") + "\n")

writeFileSync(
	join(HERE, "mapping.private.json"),
	JSON.stringify(
		{
			// Underscore keys are metadata; every other top-level key is an itemId → {A, B}.
			_note: "NOT SERVABLE. Decodes the blinded sides of round-1-tree-families after release.",
			_roundId: "p2-round-1-tree-families",
			_variants: {
				[VARIANT_ID.v1]: {
					candidateId: "p2-alpha",
					family: "quasi-flat-zone (alpha-tree)",
					algorithmVersion: TRUE_ALGORITHM_VERSION.v1,
					runFile: RUNS.v1,
					codeVersion: v1.header.codeVersion,
				},
				[VARIANT_ID.v2]: {
					candidateId: "p2-tos",
					family: "tree of shapes",
					algorithmVersion: TRUE_ALGORITHM_VERSION.v2,
					runFile: RUNS.v2,
					codeVersion: v2.header.codeVersion,
				},
			},
			_itemClass: Object.fromEntries(selectionRows.map((r) => [r.itemId, { imagePath: r.imagePath, verdict: r.verdict, coverage: r.coverage }])),
			...mapping,
		},
		null,
		"\t",
	) + "\n",
)

// A terse selection table for the report and for ROUND.md. Not a written artifact.
for (const r of selectionRows) {
	const gA = r.A === "v1" ? "alpha" : "tos"
	const gB = r.B === "v1" ? "alpha" : "tos"
	console.log([r.itemId.slice(0, 12), r.verdict, r.coverage.toFixed(3), `A=${gA}`, `B=${gB}`, r.imagePath].join(" | "))
}
console.log(`gitCommit=${gitCommit} dirty(v1)=${DIRTY.v1} dirty(v2)=${DIRTY.v2}`)
console.log(`wrote ${items.length} items`)
