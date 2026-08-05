/**
 * Round 4 (near-neutral polarity pairwise) — select the six covers and stage the two sides.
 *
 * Reads the three scan files `scan.ts` produced from the **pinned** candidate and writes:
 *
 *   - `items.jsonl`         — one item per line, in the push shape (`sides: [side, side]`), with
 *                             round 3's one documented transform left to the installer: `imagePath`
 *                             is repo-relative here and `parseItem` requires it absolute.
 *   - `render-preview.json` — a LOCAL preview of what the mock will render for each side. **Not
 *                             served, not a server input**, and named the way round 3 named it so it
 *                             cannot be mistaken for one of `review-ui/*.data.json`. The `/pairwise`
 *                             page takes everything from `/api/batches/<id>`, where the server builds
 *                             each side through `blindSidePayload`.
 *
 * Nothing here computes a palette and nothing here inverts one by hand. **Both** sides are outputs of
 * the same pinned pipeline; the only difference between the two runs is the environment variable
 * `P3_FORCE_BG_POLARITY`, and every downstream role — foreground, accent, gradient orientation,
 * collapse, verification — is re-derived by the normal cascade. See `ROUND.md`.
 *
 *   node --experimental-strip-types research/v3/prototypes/p3-fields/review-rounds/round-4-polarity/build.ts
 */

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { sideFromPalette } from "../../../../src/devloop/side.ts"
import type { Palette } from "../../../../src/contract/types.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const WORK = join(HERE, "work")
const RUN = join(HERE, "..", "..", "measurements", "run-coverage-220-0.3.0.jsonl")

/** The main checkout — where a repo-relative corpus path resolves for the installer. */
const MAIN_CHECKOUT = "/Users/Flo/GitHub/palette"

/** How many pairs the round ships. Rounds are 4–10 items (QUEUE.md standing rule). */
const PAIR_COUNT = 6

/** δ_bs, the band whose firing defines the round's primary pool. */
const TIE_BAND = 0.1

/**
 * The two sides' true names. Never served (`PushedSide.variantId` does not reach the browser), and
 * they must differ — `parseItem` refuses an item that "compares a variant with itself".
 *
 * Side 1's name says in full what it is, exactly the way round 3's `-flat-treatment` did: it is the
 * pinned pipeline run under a dev-only override that no shipped path sets, so no later reader can
 * mistake it for something `p3-fields-0.3.0` published.
 */
const PUBLISHED_VARIANT = "p3-fields-0.3.0"
const INVERTED_VARIANT = "p3-fields-0.3.0-polarity-inverted"

const PREPROCESSING = "sharp-0.33.5/srgb/no-resample/alpha-excluded"

/**
 * `5a4f845` on **both** sides, `dirty: false`, and this is the honest reading rather than a
 * convenience:
 *
 * - Side 0 is byte-for-byte the palette `5a4f845` publishes. Checked, not assumed — with the override
 *   unset the pinned copy reproduces all 220 rows of `run-coverage-220-0.3.0.jsonl` exactly
 *   (`VERIFY.md` check 8), and the only behavioural delta between `bead404` (the run's commit) and
 *   `5a4f845` is itself behind an unset env var.
 * - Side 1 is the same commit's pipeline asked a different question at one comparison. The commit is
 *   what produced it; `algorithmVersion` carries `-polarity-inverted` so the *treatment* is never
 *   lost. A fingerprint that claimed some other commit would name a commit that does not exist.
 */
const GIT_COMMIT = "5a4f845"

const PUBLISHED_FINGERPRINT = {
	algorithmVersion: PUBLISHED_VARIANT,
	preprocessingVersion: PREPROCESSING,
	gitCommit: GIT_COMMIT,
	dirty: false,
} as const

const INVERTED_FINGERPRINT = {
	algorithmVersion: INVERTED_VARIANT,
	preprocessingVersion: PREPROCESSING,
	gitCommit: GIT_COMMIT,
	dirty: false,
} as const

type ScanRow = Readonly<{
	imagePath: string
	ok: boolean
	tieBandFired: boolean
	decidedBy: string
	relativeGap: number
	e1L: number
	e2L: number
	collapsed: boolean
	backgroundL: number
	surfaceL: number
	palette: Palette
	valid: boolean
	violations: readonly string[]
	gradientPublished: boolean
	gradientStops: number
	bestSpearmanRho: number
	foregroundRegime: string
	escaped: boolean
}>

const load = (file: string): Map<string, ScanRow> =>
	new Map(
		readFileSync(join(WORK, file), "utf8").trim().split("\n").map((line) => {
			const row = JSON.parse(line) as ScanRow
			return [row.imagePath, row] as const
		}),
	)

const published = load("published-220.jsonl")
const forcedLight = load("forced-light.jsonl")
const forcedDark = load("forced-dark.jsonl")

/** The run's own zero-based index, so `#130` in a measurement and `item-130` here are one cover. */
const runIndex = new Map<string, number>()
for (const line of readFileSync(RUN, "utf8").trim().split("\n")) {
	const row = JSON.parse(line) as { kind: string; index: number; imagePath: string }
	if (row.kind === "devloop-run-row") runIndex.set(row.imagePath, row.index)
}

/** Which lightness extreme the shipped rule actually called the background on this cover. */
const publishedPolarityOf = (row: ScanRow): "dark" | "light" =>
	row.backgroundL < row.surfaceL ? "dark" : "light"

/**
 * Is this cover a two-sided question at all?
 *
 * A **collapsed** field has `surface === background` — one colour, no second end within the
 * contract's own same-colour bar — so there is no polarity to invert and the two sides would differ by
 * an amount the contract has already declared to be no difference. Eleven of the sixteen tie-band
 * covers are collapsed, which is the single largest fact about this pool and is stated in `ROUND.md`
 * rather than buried here.
 *
 * `escaped` covers are excluded for the same reason: the escape publishes a non-source colour on a
 * one-colour image and has no field ends.
 */
const isTwoSided = (row: ScanRow): boolean => row.ok && !row.collapsed && !row.escaped

const rejected: string[] = []

type Candidate = Readonly<{ row: ScanRow; opposite: ScanRow; polarity: "dark" | "light"; pool: "tie-band" | "fill" }>

function candidateOf(row: ScanRow, pool: "tie-band" | "fill"): Candidate | null {
	const label = `#${runIndex.get(row.imagePath)} (gap ${row.relativeGap.toFixed(5)}, ${pool})`
	if (!isTwoSided(row)) {
		rejected.push(`${label}: not a two-sided cover — collapsed=${row.collapsed} escaped=${row.escaped}`)
		return null
	}
	const polarity = publishedPolarityOf(row)
	// Side 1 asks for the OPPOSITE of whatever the shipped rule chose, which is a per-cover fact and
	// not a constant: the tie-band pool is published-dark by construction (the convention *is* darker),
	// but a fill cover decided by prevalence can be either.
	const opposite = (polarity === "dark" ? forcedLight : forcedDark).get(row.imagePath)
	if (opposite === undefined) throw new Error(`${label}: no forced-${polarity === "dark" ? "light" : "dark"} run`)
	// Pre-registered: both sides must independently pass `validatePalette` or the cover is excluded.
	// This round cannot settle contract validity, so it must not ship a pair where one side is already
	// contract-invalid — that would be a leading question, exactly as round 3 ruled.
	if (!row.valid || !opposite.valid) {
		const codes = [...row.violations, ...opposite.violations].join(",")
		rejected.push(`${label}: validatePalette FAIL on a side — ${codes}`)
		return null
	}
	return { row, opposite, polarity, pool }
}

// --- Selection ------------------------------------------------------------------------------
//
// Primary pool: the covers where the prevalence tie band FIRED — the near-neutral covers where the
// count carried no information and the darker-end convention decided. Ordered by how close the tie
// was, which is how deep into the convention's territory the cover sits.
//
// Fill, only if the primary pool cannot fill the round: the covers with the SMALLEST prevalence gap
// ABOVE the band. Pre-registered in the task and stated in `ROUND.md`; the rule is mechanical and no
// by-eye judgement enters it.

const all = [...published.values()].sort((left, right) => left.relativeGap - right.relativeGap)

const tieBand: Candidate[] = []
for (const row of all) {
	if (!row.ok || !row.tieBandFired) continue
	const candidate = candidateOf(row, "tie-band")
	if (candidate !== null) tieBand.push(candidate)
}

const fill: Candidate[] = []
for (const row of all) {
	if (fill.length >= PAIR_COUNT - tieBand.length) break
	// `no-extent` covers never reach step 5 — the field is a single colour to the bit, both ends are
	// the field median, and their `relativeGap` of 0 is a placeholder rather than a close comparison.
	// They are neither tie-band nor above-band; `isTwoSided` would drop them anyway (collapsed), and
	// they are skipped here so the fill pool's ordering is over real prevalence gaps only.
	if (!row.ok || row.tieBandFired || row.decidedBy !== "prevalence") continue
	if (row.relativeGap < TIE_BAND) throw new Error(`#${runIndex.get(row.imagePath)}: gap below the band but not flagged`)
	const candidate = candidateOf(row, "fill")
	if (candidate !== null) fill.push(candidate)
}

const selected = [...tieBand, ...fill]
if (selected.length !== PAIR_COUNT) throw new Error(`selected ${selected.length} pairs, want ${PAIR_COUNT}`)

// --- Emit -----------------------------------------------------------------------------------

/** Exactly what `deriveCollection` would answer for the absolute path. Stated, not left to derive. */
const collectionOf = (repoRelative: string): string =>
	repoRelative.startsWith("music-artworks/")
		? "music-artworks"
		: repoRelative.startsWith("images/")
			? "images"
			: "sharded-corpus"

/** The push-shape palette. `geometry` is dropped for round 3's reasons, restated in `ROUND.md`. */
function snapshotOf(palette: Palette) {
	return {
		background: palette.roles.background.hex,
		surface: palette.roles.surface.hex,
		foreground: palette.roles.foreground.hex,
		accent: palette.roles.accent.hex,
		gradient:
			palette.gradient === null
				? null
				: { stops: palette.gradient.stops.map((stop) => ({ color: stop.color.hex, position: stop.position })) },
		surfaceCollapsed: palette.collapse.surfaceCollapsed,
		accentCollapsed: palette.collapse.accentCollapsed,
	}
}

const WORKTREE_PREFIX = "/Users/Flo/GitHub/palette/.worktrees/p3-fields/"

const itemLines: string[] = []
const preview: Record<string, unknown> = {}

for (const { row, opposite, polarity, pool } of selected) {
	const index = runIndex.get(row.imagePath)
	if (index === undefined) throw new Error(`${row.imagePath}: not in the coverage run`)
	// `item-NNN` carries the run's own zero-based index. It is the same neutral id round 1 and round 3
	// used, and it carries no polarity hint — nothing in it says which side is which, or that the round
	// is about polarity at all.
	const itemId = `item-${String(index).padStart(3, "0")}`
	if (!row.imagePath.startsWith(WORKTREE_PREFIX)) throw new Error(`${row.imagePath}: unexpected prefix`)
	const repoRelative = row.imagePath.slice(WORKTREE_PREFIX.length)
	const artworkId = repoRelative.split("/").pop()?.replace(/\.(jpe?g|png|webp)$/i, "") ?? null

	itemLines.push(
		JSON.stringify({
			itemId,
			imagePath: repoRelative,
			collection: collectionOf(repoRelative),
			artworkId,
			sides: [
				{ variantId: PUBLISHED_VARIANT, palette: snapshotOf(row.palette), fingerprint: PUBLISHED_FINGERPRINT },
				{ variantId: INVERTED_VARIANT, palette: snapshotOf(opposite.palette), fingerprint: INVERTED_FINGERPRINT },
			],
			// Not part of the push shape — the orchestrator's read of the round, the same way round 3
			// carried `bestRho`. `parseItem` reads only the fields above and ignores these. **They must
			// not be shown to anyone reviewing:** `publishedPolarity` names which side is which. Strip
			// them if the installer prefers a clean push; nothing depends on their being sent.
			pool,
			prevalenceRelativeGap: row.relativeGap,
			tieBandFired: row.tieBandFired,
			decidedBy: row.decidedBy,
			publishedPolarity: polarity,
			backgroundL: row.backgroundL,
			surfaceL: row.surfaceL,
			deltaL: Math.abs(row.e1L - row.e2L),
			runIndex: index,
		}),
	)

	preview[itemId] = {
		pushedSide0_asPublished: sideFromPalette(row.palette),
		pushedSide1_polarityInverted: sideFromPalette(opposite.palette),
	}
}

writeFileSync(join(HERE, "items.jsonl"), `${itemLines.join("\n")}\n`)
writeFileSync(join(HERE, "render-preview.json"), `${JSON.stringify(preview, null, "\t")}\n`)

console.log(`${itemLines.length} pairs written; main checkout = ${MAIN_CHECKOUT}`)
console.log(`tie-band pool: ${tieBand.length} shipped; fill pool: ${fill.length} shipped`)
for (const line of rejected) console.log(`  rejected: ${line}`)
