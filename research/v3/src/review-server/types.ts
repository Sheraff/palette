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
	OracleLabelRecord,
	PaletteSnapshot,
	Preference,
	VerdictRecord,
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

/**
 * One item of a calibration round: one artwork, one palette, no comparison (REVIEW_UI.md §5).
 *
 * `variantId` and `fingerprint` are the same true names a pairwise side carries, and they are
 * withheld from the payload for the same reason. There is nothing to blind in absolute grading — one
 * palette cannot be shuffled against itself — but an algorithm version on screen would still tell
 * the reviewer whose palette they are grading, and the grade is supposed to be about the palette.
 */
export type PushedCalibrationItem = Readonly<{
	itemId: string
	/** Absolute path. Artworks are identified by full path + content hash (CONVENTIONS.md). */
	imagePath: string
	collection?: string
	artworkId?: string | null
	variantId: string
	palette: PaletteSnapshot
	fingerprint: CodeFingerprint
}>

export type PushedCalibrationBatch = Readonly<{
	batchId: string
	purpose: BatchPurpose
	fundedBy: readonly string[]
	items: readonly PushedCalibrationItem[]
}>

export type StoredCalibrationItem = Readonly<{
	itemId: string
	artwork: ArtworkIdentity
	paletteHash: string
	colorNames: Readonly<Record<string, string>>
}>

/**
 * A calibration round sharing the queue, the batch log, the release flow and the warehouse.
 *
 * No blinding salt: with one palette per item there is no side order to hide. Everything else is
 * the pairwise batch's shape, because everything else about it is the same job.
 */
export type StoredCalibrationBatch = Readonly<{
	kind: "calibration"
	batch: PushedCalibrationBatch
	pushedAt: string
	items: readonly StoredCalibrationItem[]
}>

export type StoredAnyBatch = StoredBatch | StoredBracketingBatch | StoredOracleBatch | StoredCalibrationBatch

export function isBracketingBatch(stored: StoredAnyBatch): stored is StoredBracketingBatch {
	return (stored as StoredBracketingBatch).kind === "bracketing"
}

export function isOracleBatch(stored: StoredAnyBatch): stored is StoredOracleBatch {
	return (stored as StoredOracleBatch).kind === "oracle-validation"
}

export function isCalibrationBatch(stored: StoredAnyBatch): stored is StoredCalibrationBatch {
	return (stored as StoredCalibrationBatch).kind === "calibration"
}

/**
 * How the preference on a pairwise verdict got its value.
 *
 * `explicit` — the reviewer pressed it. `prefilled` — the two grades differed, so the page filled in
 * the better-graded side and the reviewer left it there (they can always override it; overriding
 * makes it explicit).
 *
 * Recorded because the two are not the same evidence, and nothing downstream can tell them apart
 * afterwards. Reviewer, 2026-08-03: *"if I rate 'A strong' and then 'B weak' I should not have to
 * rate 'A is better'"* — that convenience is right, and it also means a preference can now exist
 * without anyone having stated it. Adjudication that weighs a preference, and any future measurement
 * of reviewer consistency, needs to know which kind it is holding.
 *
 * Equal grades never prefill: two strongs are not interchangeable (regrade agreement ~88%,
 * REVIEW_UI.md §2), so there the reviewer still presses one, including "no preference".
 */
export const PREFERENCE_SOURCES = ["explicit", "prefilled"] as const
export type PreferenceSource = (typeof PREFERENCE_SOURCES)[number]

/**
 * A verdict record as this server writes and replays it: the warehouse's own `VerdictRecord` plus one
 * additive field.
 *
 * Why additive and not a schema change: `records.ts` belongs to the contract/warehouse workstream
 * (CONVENTIONS.md path ownership), and `VerdictRecord` had no field that fits — `comment` is the
 * reviewer's raw text and must stay theirs, and `PaletteSnapshot.meta` is about a palette, not about
 * how a judgement was entered. `validateRecord` checks the fields it knows and passes anything else
 * through untouched, and `serializeRecord` writes every key, so the flag round-trips through append,
 * read and restart-replay without the schema version moving or any other workstream's code changing.
 *
 * Optional here, not required, for the two honest reasons a reader would ask about: records written
 * before this existed do not carry it, and a direct API caller need not send it. Both are read as
 * `explicit`, which is what they are — nothing prefilled them.
 *
 * It is deliberately **not** in `AMENDABLE_FIELDS`, so no amendment can rewrite it. An amendment is
 * a reviewer typing a reason six weeks later; it is explicit by construction, and it never converts
 * a record that says how the *original* answer was entered.
 */
export type StoredVerdictRecord = VerdictRecord & { preferenceSource?: PreferenceSource | null }

/** What the browser submits for one item. */
export type VerdictInput = Readonly<{
	gradeA: Grade
	gradeB: Grade
	preference: Preference
	/** Whether the reviewer pressed the preference or accepted the one the grades implied. */
	preferenceSource: PreferenceSource
	/** Free text: the primary channel. May be empty. */
	comment: string
	confound: boolean
	/** Required non-empty when `confound` is true. */
	confoundNote: string
}>

/**
 * What the browser submits for one calibration item (REVIEW_UI.md §5).
 *
 * One grade, no preference, no second side. The confound flag is deliberately absent too: "I'm only
 * choosing A because B has a defect" is a statement about a comparison, and there is no comparison
 * here.
 */
export type AbsoluteVerdictInput = Readonly<{
	grade: Grade
	comment: string
}>

/**
 * An `oracle-label` record that says which record it replaced.
 *
 * **Why this is here and not in `records.ts`.** It is an additive extension the review server writes
 * and the analyses read; the warehouse schema owns the base record and validates it permissively, so
 * a record carrying these two fields is a valid `oracle-label` today and a record without them stays
 * valid forever. The schema workstream should fold it into `OracleLabelRecord` proper — see the
 * proposed ledger entry — at which point this alias becomes a re-export.
 *
 * **What it fixes.** The reviewer can step back and answer again, which writes a second record for
 * the same `(questionKey, imageId)`. The bcde round shipped 163 records covering 160 answers for
 * exactly this reason. Nothing on the records said which was which: the server's revision counter
 * was in-memory only, so supersession had to be reconstructed from FILE ORDER by every consumer
 * independently — the warehouse query CLI, a future join, an agent doing arithmetic on `wc -l`. Any
 * of them that did not replicate the convention exactly saw 163 rows with 3 phantoms. The pairwise
 * path already records `supersededVerdictIds`; this is the same fact for the oracle path.
 */
export type SupersedingOracleLabel = OracleLabelRecord & {
	/** The record this answer replaces, or null when it is the first answer for the item. */
	supersedes: string | null
	/** 1 for a first answer, 2 for the first re-answer, and so on. */
	revision: number
}
