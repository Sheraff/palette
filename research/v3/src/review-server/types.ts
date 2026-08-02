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
