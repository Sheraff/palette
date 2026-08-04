/**
 * Round 3 (flat-vs-gradient pairwise) — stage the eight selected pairs.
 *
 * Reads the two measurement files this round is defined against and writes the two staging files:
 *
 *   - `items.jsonl`         — one item per line, **in the push shape** (`sides: [side, side]`), with
 *                             one documented transform left to the installer: `imagePath` is
 *                             repo-relative here and `parseItem` requires it absolute.
 *   - `render-preview.json` — a LOCAL preview of what the mock will render for each side. **Not
 *                             served, not a server input.** The `/pairwise` page takes everything
 *                             from `/api/batches/<id>`, where the server builds each side through
 *                             `blindSidePayload`; this file exists only so a human can eyeball the
 *                             two treatments during staging, and so `verify.ts` can compare them.
 *
 * Nothing here recomputes a palette. The 0.3.0 coverage run's rows are the source of every hex, and
 * the flat side is the published palette with `gradient` set to `null` — no other field touched.
 *
 *   node --experimental-strip-types research/v3/prototypes/p3-fields/review-rounds/round-3-gradient-pairwise/build.ts
 */

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { sideFromPalette } from "../../../../src/devloop/side.ts"
import { validatePalette } from "../../../../src/contract/invariants.ts"
import type { Palette } from "../../../../src/contract/types.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const MEASUREMENTS = join(HERE, "..", "..", "measurements")
const BORDERLINE = join(MEASUREMENTS, "gradient-borderline-0.3.0.json")
const RUN = join(MEASUREMENTS, "run-coverage-220-0.3.0.jsonl")

/** The main checkout — where a repo-relative corpus path resolves for the installer. */
const MAIN_CHECKOUT = "/Users/Flo/GitHub/palette"

/** How many pairs the round ships. Rounds are 4–10 items (QUEUE.md standing rule). */
const PAIR_COUNT = 8

/** The provisional boundary this round is here to anchor. [UNCALIBRATED]. */
const RHO_STAR = 0.62

/**
 * The two sides' true names. Never served (`PushedSide.variantId`), and they must differ —
 * `parseItem` refuses an item that "compares a variant with itself".
 *
 * The flat side is NOT the output of any code path. There is no force-gradient / force-flat switch
 * in the candidate, and `src/` is read-only to this worker, so the flat treatment is constructed
 * here by deleting the published `gradient`. Its variant id and algorithm version say so, in full,
 * so that no later reader can mistake it for something `p3-fields-0.3.0` emitted.
 */
const GRADIENT_VARIANT = "p3-fields-0.3.0"
const FLAT_VARIANT = "p3-fields-0.3.0-flat-treatment"

const PREPROCESSING = "sharp-0.33.5/srgb/no-resample/alpha-excluded"
const GIT_COMMIT = "bead404"

const GRADIENT_FINGERPRINT = {
	algorithmVersion: GRADIENT_VARIANT,
	preprocessingVersion: PREPROCESSING,
	gitCommit: GIT_COMMIT,
	dirty: false,
} as const

const FLAT_FINGERPRINT = {
	algorithmVersion: FLAT_VARIANT,
	preprocessingVersion: PREPROCESSING,
	gitCommit: GIT_COMMIT,
	dirty: false,
} as const

type Borderline = Readonly<{
	rhoStar: number
	artworks: readonly Readonly<{
		artworkId: string
		imagePath: string
		bestRho: number
		distanceFromRhoStar: number
		side: string
		publishedGradient: boolean
	}>[]
}>

type RunRow = Readonly<{ kind: string; index: number; imagePath: string; ok: boolean; palette: Palette }>

const borderline = JSON.parse(readFileSync(BORDERLINE, "utf8")) as Borderline
if (borderline.rhoStar !== RHO_STAR) throw new Error(`measurement rhoStar ${borderline.rhoStar} != ${RHO_STAR}`)

const rows: RunRow[] = []
for (const line of readFileSync(RUN, "utf8").trim().split("\n")) {
	const parsed = JSON.parse(line) as RunRow
	if (parsed.kind === "devloop-run-row") rows.push(parsed)
}

/** The run executed inside the worktree; its rows carry absolute worktree paths. Match on suffix. */
function rowFor(repoRelativePath: string): RunRow {
	const hits = rows.filter((row) => row.imagePath.endsWith(`/${repoRelativePath}`))
	if (hits.length !== 1) throw new Error(`${repoRelativePath}: ${hits.length} matching run rows, want exactly 1`)
	return hits[0]
}

/** Exactly what `deriveCollection` would answer for the absolute path. Stated, not left to derive. */
function collectionOf(repoRelativePath: string): string {
	return repoRelativePath.startsWith("music-artworks/") ? "music-artworks" : "sharded-corpus"
}

/** The push-shape palette. `geometry` is dropped: it is an object in the run and a string in the
 *  snapshot, the display mapping ignores it (`gradient.ts` renders 135° linear for every family),
 *  and round 1 dropped it for the same reason. */
function snapshotOf(palette: Palette, withGradient: boolean) {
	return {
		background: palette.roles.background.hex,
		surface: palette.roles.surface.hex,
		foreground: palette.roles.foreground.hex,
		accent: palette.roles.accent.hex,
		gradient:
			withGradient && palette.gradient !== null
				? { stops: palette.gradient.stops.map((stop) => ({ color: stop.color.hex, position: stop.position })) }
				: null,
		surfaceCollapsed: palette.collapse.surfaceCollapsed,
		accentCollapsed: palette.collapse.accentCollapsed,
	}
}

// --- Selection ------------------------------------------------------------------------------
//
// Published-gradient borderline covers only. Without a force-gradient path the gradient side can
// only exist where 0.3.0 already published one — the one-sidedness ROUND.md pre-registers.
// Then: drop anything failing `validatePalette` on EITHER treatment, keep the `PAIR_COUNT` closest
// to rho*.

const pool = borderline.artworks.filter((artwork) => artwork.publishedGradient)
const kept: { artwork: Borderline["artworks"][number]; row: RunRow }[] = []
const dropped: string[] = []

for (const artwork of pool) {
	const row = rowFor(artwork.imagePath)
	if (!row.ok) {
		dropped.push(`${artwork.imagePath}: run row not ok`)
		continue
	}
	const published = validatePalette(row.palette)
	const flat = validatePalette({ ...row.palette, gradient: null })
	if (!published.valid || !flat.valid) {
		const codes = [...published.violations, ...flat.violations].map((violation) => violation.code).join(",")
		dropped.push(`${artwork.imagePath} (rho ${artwork.bestRho.toFixed(4)}): validatePalette FAIL — ${codes}`)
		continue
	}
	kept.push({ artwork, row })
}

kept.sort((left, right) => Math.abs(left.artwork.distanceFromRhoStar) - Math.abs(right.artwork.distanceFromRhoStar))
const selected = kept.slice(0, PAIR_COUNT)
for (const { artwork } of kept.slice(PAIR_COUNT)) {
	dropped.push(`${artwork.imagePath} (rho ${artwork.bestRho.toFixed(4)}): farther from rho* than the kept ${PAIR_COUNT}`)
}
if (selected.length !== PAIR_COUNT) throw new Error(`selected ${selected.length} pairs, want ${PAIR_COUNT}`)

// Ship in descending rho, the measurement file's own order — the order the decision rule reads.
selected.sort((left, right) => right.artwork.bestRho - left.artwork.bestRho)

// --- Emit -----------------------------------------------------------------------------------

const itemLines: string[] = []
const preview: Record<string, unknown> = {}

for (const { artwork, row } of selected) {
	// `item-NNN` carries the coverage-220 run's own zero-based index, so `#181` in a measurement and
	// `item-181` here are the same cover. Same convention as round 1.
	const itemId = `item-${String(row.index).padStart(3, "0")}`

	itemLines.push(
		JSON.stringify({
			itemId,
			imagePath: artwork.imagePath,
			collection: collectionOf(artwork.imagePath),
			artworkId: artwork.artworkId,
			sides: [
				{ variantId: GRADIENT_VARIANT, palette: snapshotOf(row.palette, true), fingerprint: GRADIENT_FINGERPRINT },
				{ variantId: FLAT_VARIANT, palette: snapshotOf(row.palette, false), fingerprint: FLAT_FINGERPRINT },
			],
			// Not part of the push shape — the orchestrator's read of the round. `parseItem` reads
			// only the fields above and ignores these; they are here so one grepped line says which
			// rho the item is anchoring.
			bestRho: artwork.bestRho,
			distanceFromRhoStar: artwork.distanceFromRhoStar,
			runIndex: row.index,
		}),
	)

	preview[itemId] = {
		pushedSide0_gradient: sideFromPalette(row.palette),
		pushedSide1_flat: sideFromPalette({ ...row.palette, gradient: null }),
	}
}

writeFileSync(join(HERE, "items.jsonl"), `${itemLines.join("\n")}\n`)
writeFileSync(join(HERE, "render-preview.json"), `${JSON.stringify(preview, null, "\t")}\n`)

console.log(`${itemLines.length} pairs written; main checkout = ${MAIN_CHECKOUT}`)
console.log(`pool = ${pool.length} published-gradient borderline covers`)
for (const line of dropped) console.log(`  dropped: ${line}`)
