/**
 * Request- and UI-facing types for the v3 review server.
 *
 * Everything that gets *persisted* comes from the warehouse library
 * (`research/v3/src/warehouse/records.ts`) — grades, preferences, batch purposes, palettes,
 * fingerprints, artwork identity. They are re-exported here so this workstream cannot drift into
 * a second vocabulary. What stays local is only the shape of a *pushed batch* and of a *reviewer
 * input*: the wire format between orchestrator, browser and server, which is nobody else's
 * business.
 */
import type {
	ArtworkIdentity,
	BatchPurpose,
	CodeFingerprint,
	Grade,
	PaletteSnapshot,
	Preference,
} from "../warehouse/records.ts"
import type { BracketingFixture } from "./bracketing.ts"
import type { OracleValidationFixture } from "./oracle-validation.ts"

export {
	BATCH_PURPOSES,
	GRADES,
	PREFERENCES,
	type ArtworkIdentity,
	type BatchPurpose,
	type CodeFingerprint,
	type Grade,
	type PaletteSnapshot,
	type Preference,
} from "../warehouse/records.ts"

/** Published flat roles, in display order. [INHERITED] output contract, PHASE_0_DECISIONS.md §2. */
export const ROLES = ["background", "surface", "foreground", "accent"] as const
export type Role = (typeof ROLES)[number]

/** Blinded side names shown to the reviewer. The variant ids live server-side only. */
export const SIDES = ["A", "B"] as const
export type Side = (typeof SIDES)[number]

/**
 * One side of one comparison, as pushed by the orchestrator.
 *
 * `variantId` is the TRUE name of the side (trunk, arm, paradigm). It is never served.
 */
export type PushedSide = Readonly<{
	variantId: string
	palette: PaletteSnapshot
	fingerprint: CodeFingerprint
}>

export type PushedItem = Readonly<{
	itemId: string
	/** Absolute path. Artworks are identified by full path + content hash (CONVENTIONS.md). */
	imagePath: string
	/** Corpus this rendition belongs to. Derived from the path when the pusher omits it. */
	collection?: string
	/** Groups renditions of the same artwork. Null when the grouping is unknown. */
	artworkId?: string | null
	sides: readonly [PushedSide, PushedSide]
}>

export type PushedBatch = Readonly<{
	batchId: string
	/** What this batch is testing. REVIEW_UI.md §7. */
	purpose: BatchPurpose
	/** Record ids of the evidence that motivated the batch. */
	fundedBy: readonly string[]
	items: readonly PushedItem[]
}>

/** A pushed batch plus everything derived at push time. Server-side state; never served whole. */
export type StoredBatch = Readonly<{
	/** Absent on batches written before bracketing rounds existed; absent means pairwise. */
	kind?: "pairwise"
	batch: PushedBatch
	pushedAt: string
	/**
	 * The per-batch blinding salt. This is the unblinding key: without it the side order cannot be
	 * derived from anything the browser receives. Never served, never logged.
	 */
	blindingSalt: string
	items: readonly StoredItem[]
}>

export type StoredItem = Readonly<{
	itemId: string
	/** Full path, content hash and header-derived rendition facts. */
	artwork: ArtworkIdentity
	/** Canonical content hash of each pushed side's palette, in pushed order. */
	paletteHashes: readonly [string, string]
	/**
	 * The unblinding key: which pushed side index each blinded side shows.
	 * Server-side only — never part of any served payload.
	 */
	blinding: Readonly<{ A: 0 | 1; B: 0 | 1 }>
	/** Presentation-only nearest color names, keyed by lowercase hex. */
	colorNames: Readonly<Record<string, string>>
}>

/**
 * A calibration round sharing the queue with pairwise batches.
 *
 * The items are colour pairs, not palettes, so the whole generated fixture is stored as-is rather
 * than materialized item by item. It lives in the same batch log for the same reason the pairwise
 * batches do: it holds the truth (the real distances) that the reviewer must not see.
 */
export type StoredBracketingBatch = Readonly<{
	kind: "bracketing"
	batchId: string
	purpose: BatchPurpose
	fundedBy: readonly string[]
	pushedAt: string
	fixture: BracketingFixture
	/**
	 * Opaque per-item tokens, token → fixture itemId. The browser is given the token and never the
	 * itemId, because the itemIds are readable: `p1-dark-neutral-04` names the stratum and the rung,
	 * and `…-control-0` / `…-repeat-1` would announce the controls and the silent repeats outright.
	 * Random per batch, so the committed fixture cannot be mapped back to them either.
	 */
	answerTokens: Readonly<Record<string, string>>
}>

/**
 * An oracle-validation round sharing the queue with the other kinds (REVIEW_UI.md §6).
 *
 * The items are (artwork, question, closed vocabulary) triples. The whole fixture is stored as-is,
 * plus the artwork identity materialized at push time — the fixture carries the path and the hash
 * the round was designed against, and the push is where the file on disk is checked against it.
 */
export type StoredOracleBatch = Readonly<{
	kind: "oracle-validation"
	batchId: string
	purpose: BatchPurpose
	fundedBy: readonly string[]
	pushedAt: string
	fixture: OracleValidationFixture
	/** Materialized artwork identity per fixture item id: full path, content hash, header dimensions. */
	artworks: Readonly<Record<string, ArtworkIdentity>>
	/**
	 * Opaque per-item tokens, token → fixture itemId. Same reason as the bracketing round's: the
	 * browser needs *a* name to answer with, and it should not be one that carries meaning. Random
	 * per batch, so the committed fixture cannot be mapped back to them either.
	 */
	answerTokens: Readonly<Record<string, string>>
}>

export type StoredAnyBatch = StoredBatch | StoredBracketingBatch | StoredOracleBatch

export function isBracketingBatch(stored: StoredAnyBatch): stored is StoredBracketingBatch {
	return (stored as StoredBracketingBatch).kind === "bracketing"
}

export function isOracleBatch(stored: StoredAnyBatch): stored is StoredOracleBatch {
	return (stored as StoredOracleBatch).kind === "oracle-validation"
}

/** What the browser submits for one item. */
export type VerdictInput = Readonly<{
	gradeA: Grade
	gradeB: Grade
	preference: Preference
	/** Free text: the primary channel. May be empty. */
	comment: string
	confound: boolean
	/** Required non-empty when `confound` is true. */
	confoundNote: string
}>
