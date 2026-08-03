/**
 * V3 verdict warehouse — record definitions.
 *
 * The warehouse is an append-only JSONL log. One record per line. Nothing is ever
 * edited or deleted in place: corrections arrive as `amendment` records that point at
 * an earlier record, and the latest amendment wins at query time (REVIEW_UI.md §1).
 *
 * Design rules followed here:
 * - Records are self-describing. An append-only log cannot do joins cheaply, and a
 *   `grep` of one line should tell you what the line is about. So batch metadata
 *   (REVIEW_UI.md §7) is denormalized onto every record that belongs to a batch.
 * - Artworks are identified by full path + content hash, never by id prefix
 *   (CONVENTIONS.md). Rendition facts come from image headers, never from filenames.
 * - Every record carries the warehouse schema version. This is the mechanism that
 *   structurally rejects v2-3 format records (PHASE_0_DECISIONS.md §5).
 * - The warehouse stores and hashes palettes; it never validates them. The contract
 *   module (`research/v3/src/contract/`) is the authority on palette shape.
 */

import { createHash, randomBytes } from 'node:crypto'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Warehouse record schema version, stamped on every record.
 * [REVIEWED] — PHASE_0_DECISIONS.md §5: "the v3 warehouse schema (dual grades, code
 * fingerprints) structurally rejects old-format records". Bump only on a breaking
 * change to the record shapes below.
 */
export const WAREHOUSE_SCHEMA_VERSION = 'v3.0'

/**
 * Record types the warehouse accepts.
 * [REVIEWED] — REVIEW_UI.md §1, verbatim list.
 */
export const RECORD_TYPES = [
	'verdict',
	'note',
	'endorsed-sample',
	'veto',
	'amendment',
	'batch-complete',
	'oracle-label',
] as const
export type RecordType = (typeof RECORD_TYPES)[number]

/**
 * Grade scale. Reviewer's definitions, verbatim (REVIEW_UI.md §2, 2026-08-02):
 *   strong       — "I'd be happy to get this as a result"
 *   acceptable   — "not ideal, but I understand how it got here"
 *   weak         — "we must have missed something important"
 *   unacceptable — "the algorithm is broken"
 * Ordered best-first; `GRADE_RANK` gives the ordinal used by the movement rule.
 * [REVIEWED] — REVIEW_UI.md §2.
 */
export const GRADES = ['strong', 'acceptable', 'weak', 'unacceptable'] as const
export type Grade = (typeof GRADES)[number]

/**
 * Ordinal for grade comparison (lower is better). Used by "never move to a
 * lower-graded palette"; a move between two equal grades is a sidegrade.
 * [REVIEWED] — REVIEW_UI.md §2.
 */
export const GRADE_RANK: Record<Grade, number> = {
	strong: 0,
	acceptable: 1,
	weak: 2,
	unacceptable: 3,
}

/**
 * Preference values. "no-preference" contributes no ordering constraint.
 * [REVIEWED] — REVIEW_UI.md §2.
 */
export const PREFERENCES = ['a', 'b', 'no-preference'] as const
export type Preference = (typeof PREFERENCES)[number]

/**
 * What a batch is testing. Declared at push time so the warehouse can answer
 * "what evidence funded this decision" without archaeology.
 * [REVIEWED] — REVIEW_UI.md §7, verbatim list.
 */
export const BATCH_PURPOSES = [
	'mechanism',
	'arm',
	'calibration',
	'outlier-mine',
	'oracle-validation',
	'bake-off',
] as const
export type BatchPurpose = (typeof BATCH_PURPOSES)[number]

/**
 * Verdict modes. `pairwise` is the atomic comparative unit (REVIEW_UI.md §2);
 * `absolute` is calibration mode — absolute grading of one palette, no comparison
 * (REVIEW_UI.md §5, "same grade scale, same warehouse"). Calibration gets a mode
 * flag rather than a record type of its own, because the record-type list is closed.
 * [REVIEWED] — REVIEW_UI.md §2 and §5.
 */
export const VERDICT_MODES = ['pairwise', 'absolute'] as const
export type VerdictMode = (typeof VERDICT_MODES)[number]

/** Veto scope. `artwork` vetoes every rendition; `rendition` vetoes this file only. */
export const VETO_SCOPES = ['artwork', 'rendition'] as const
export type VetoScope = (typeof VETO_SCOPES)[number]

/** Oracle-label confidence, matching the oracle's own vocabulary. [INHERITED] — oracle pipeline doc §9.2. */
export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number]

/**
 * Fields an amendment is allowed to replace, per record type.
 *
 * An amendment expresses a second thought about a *judgment*. It may never change
 * what the record was *about* — identity, provenance, and the palettes that were
 * actually shown are frozen at append time. A verdict is always about the exact
 * palettes shown (REVIEW_UI.md §1); letting an amendment rewrite a content hash
 * would destroy that guarantee.
 * [REVIEWED] — derived from REVIEW_UI.md §1 ("a verdict is always about the exact
 * palettes shown") and §2 ("corrections and second thoughts").
 */
export const AMENDABLE_FIELDS: Record<RecordType, readonly string[]> = {
	verdict: ['gradeA', 'gradeB', 'preference', 'comment', 'confound', 'confoundNote'],
	note: ['text', 'tags'],
	// An endorsement is immutable evidence of what the reviewer actually assembled and
	// previewed. A changed palette is a NEW endorsement, not an amendment. Only the
	// comment is amendable; a mistaken endorsement is withdrawn with `retract: true`.
	// [REVIEWED] — orchestrator decision, 2026-08-02.
	'endorsed-sample': ['comment'],
	veto: ['reason', 'scope'],
	'batch-complete': ['note'],
	'oracle-label': ['answer', 'confidence', 'ambiguityNote'],
	amendment: [], // amend the original again; amendments are not themselves amendable in place
}

/**
 * Short id prefix per record type, so a raw `grep` of the log tells you the type
 * of a referenced id without a lookup.
 * [UNCALIBRATED] — chosen here for greppability; no external source.
 */
export const ID_PREFIX: Record<RecordType, string> = {
	verdict: 'v',
	note: 'n',
	'endorsed-sample': 'e',
	veto: 'x',
	amendment: 'am',
	'batch-complete': 'bc',
	'oracle-label': 'o',
}

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

/**
 * Who produced the record. `human` is the reviewer (the only ground truth);
 * `agent` covers derived records such as the tagging agent's tag notes
 * (REVIEW_UI.md §4). Maps to `human_labels.reviewer` for oracle labels.
 */
export interface Author {
	kind: 'human' | 'agent'
	id: string
}

/**
 * Rendition facts. Dimensions and format come from image headers (`sharp
 * .metadata()`), never from filenames — `music-artworks/` filenames lie
 * (CONVENTIONS.md). `artworkId` groups renditions of the same artwork; null when
 * the grouping is unknown.
 */
export interface Rendition {
	width: number
	height: number
	format: string
	bytes: number
	collection: string
	artworkId: string | null
}

/** Full path + content hash + rendition. Never an id prefix (CONVENTIONS.md). */
export interface ArtworkIdentity {
	path: string
	sha256: string
	rendition: Rendition
}

/**
 * Code fingerprint of one side, materialized at batch push time (REVIEW_UI.md §1).
 * `dirty` records whether the working tree had uncommitted changes when the batch
 * was pushed — without it a commit hash can silently mean two different things.
 */
export interface CodeFingerprint {
	algorithmVersion: string
	preprocessingVersion: string
	gitCommit: string
	dirty: boolean
}

/**
 * A palette as stored by the warehouse. Deliberately a loose mirror of the output
 * contract (PHASE_0_DECISIONS.md §2) — the warehouse hashes and stores it, and never
 * validates it. The contract module is authoritative.
 * [HELD] — shape follows PHASE_0_DECISIONS.md §2; re-check when the contract lands.
 */
export interface PaletteSnapshot {
	background: string
	surface: string
	foreground: string
	accent: string
	gradient: null | { stops: Array<{ color: string; position: number }>; geometry?: string }
	surfaceCollapsed?: boolean
	accentCollapsed?: boolean
	meta?: Record<string, unknown>
}

/**
 * One side of a pairwise item, as shown.
 *
 * `variantId` names what the side actually was (trunk, arm, paradigm). It is
 * recorded here because adjudication is impossible without it — but the review
 * server must never serve it: sides are shuffled per item by content hash and the
 * unblinding key is never served (REVIEW_UI.md §2).
 */
export interface VerdictSide {
	paletteHash: string
	fingerprint: CodeFingerprint
	variantId: string
	/** Optional inline copy of the palette shown, for offline re-inspection. */
	palette?: PaletteSnapshot | null
}

/**
 * Batch scoping metadata, denormalized onto every record belonging to a batch
 * (REVIEW_UI.md §7). `itemCount` is the batch size at push time — it is what makes
 * `pending` computable from the log alone, without a separate declaration record.
 * `fundedBy` lists the record ids of the evidence that motivated the batch.
 */
export interface BatchRef {
	id: string
	purpose: BatchPurpose
	itemCount: number
	fundedBy: string[]
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export interface RecordBase {
	id: string
	type: RecordType
	/** ISO-8601 UTC, millisecond precision. */
	ts: string
	/** Warehouse schema version — see WAREHOUSE_SCHEMA_VERSION. */
	schema: string
	author: Author
}

/**
 * A verdict about one item of one batch.
 *
 * Both sides get a grade — the v2-3 gap this fixes: "prefer A, A is strong" never
 * said whether B was also strong (REVIEW_UI.md §2). In `absolute` (calibration)
 * mode `sideB`, `gradeB` and `preference` are null.
 */
export interface VerdictRecord extends RecordBase {
	type: 'verdict'
	mode: VerdictMode
	batch: BatchRef
	/** Unique within the batch. */
	itemId: string
	artwork: ArtworkIdentity
	sideA: VerdictSide
	sideB: VerdictSide | null
	gradeA: Grade
	gradeB: Grade | null
	preference: Preference | null
	/** Free text — the primary reviewer channel (REVIEW_UI.md §4). May be empty. */
	comment: string
	/** "I'm choosing A only because B has an unrelated defect" (REVIEW_UI.md §2). */
	confound: boolean
	/** Which defect. Required non-empty when `confound` is true. */
	confoundNote: string | null
}

/**
 * A note-only record. Either a raw reviewer note, or a *derived* record filed by the
 * tagging agent — derived records point back at their source and can be dropped and
 * rebuilt at any time; the raw text stays authoritative (REVIEW_UI.md §4).
 */
export interface NoteRecord extends RecordBase {
	type: 'note'
	batch: BatchRef | null
	itemId: string | null
	artwork: ArtworkIdentity | null
	text: string
	/** Queryable tags. On derived records these come from the symmetric vocabulary. */
	tags: string[]
	derived: null | {
		/** Record id this note was derived from (its raw text lives there). */
		fromRecordId: string
		agent: string
		agentVersion: string
	}
}

/**
 * A palette the reviewer assembled by hand in the composer.
 *
 * Statistical weight: never a fitting target, never an auto-win (REVIEW_UI.md §4).
 * Primary uses: reachability diagnosis, destination adjudication, complaint
 * interpretation.
 */
export interface EndorsedSampleRecord extends RecordBase {
	type: 'endorsed-sample'
	batch: BatchRef | null
	itemId: string | null
	artwork: ArtworkIdentity
	palette: PaletteSnapshot
	paletteHash: string
	/** Palette hash of the shown side this was assembled from, when it started from one. */
	basedOnPaletteHash: string | null
	comment: string
}

/** An artwork the reviewer rules out of the corpus. */
export interface VetoRecord extends RecordBase {
	type: 'veto'
	batch: BatchRef | null
	itemId: string | null
	artwork: ArtworkIdentity
	reason: string
	scope: VetoScope
}

/**
 * A correction to an earlier record. Latest amendment wins at query time.
 *
 * `targetId` may point at the original record or at a previous amendment of it —
 * both resolve to the same chain (see `warehouse.ts` `resolve`). `patch` may only
 * carry fields listed in AMENDABLE_FIELDS for the target's type. `retract` withdraws
 * the target entirely; a retracted record must fund nothing.
 */
export interface AmendmentRecord extends RecordBase {
	type: 'amendment'
	targetId: string
	patch: Record<string, unknown>
	retract: boolean
	reason: string
}

/**
 * Batch release — the explicit reviewer action that closes a batch
 * (REVIEW_UI.md §1). This is the trigger the background watcher waits for.
 * It repeats the batch manifest so the release line is a complete statement of what
 * the batch was.
 */
export interface BatchCompleteRecord extends RecordBase {
	type: 'batch-complete'
	batchId: string
	purpose: BatchPurpose | null
	itemCount: number | null
	fundedBy: string[]
	/** Item ids released, when the server records them. */
	releasedItemIds: string[] | null
	note: string
}

/**
 * One human answer to one oracle question about one image (REVIEW_UI.md §6).
 *
 * Columns mirror `human_labels` in the oracle pipeline doc §9.2: image id, schema
 * version, reviewer (= `author.id`), answer, timestamp. `stratum` records which
 * embedding-space stratum the item was drawn from, because the stopping rule is
 * evaluated per stratum. Deliberately absent: any timing of the reviewer
 * (REVIEW_UI.md §4, "no timing of the reviewer").
 */
export interface OracleLabelRecord extends RecordBase {
	type: 'oracle-label'
	/** Collection-qualified image id, as used by the oracle tables. */
	imageId: string
	/** Full identity alongside the id, per CONVENTIONS.md. Null when unresolved. */
	artwork: ArtworkIdentity | null
	/** Question-set schema version (oracle `schema_version`), not the warehouse schema. */
	labelSchemaVersion: string
	/** e.g. "ground_type", "has_text". */
	questionKey: string
	/** Closed-vocabulary answer; array for multi-select questions. */
	answer: string | string[] | boolean | number
	confidence: ConfidenceLevel | null
	/** Human audit only — never read by code (oracle pipeline doc §9.2). */
	ambiguityNote: string | null
	/** Embedding-space stratum the item was drawn from, for per-stratum stopping. */
	stratum: string | null
	batch: BatchRef | null
}

export type WarehouseRecord =
	| VerdictRecord
	| NoteRecord
	| EndorsedSampleRecord
	| VetoRecord
	| AmendmentRecord
	| BatchCompleteRecord
	| OracleLabelRecord

/** A record as handed to `append`: id, ts and schema are filled in by the warehouse. */
export type RecordInput<T extends WarehouseRecord = WarehouseRecord> = Omit<T, 'id' | 'ts' | 'schema'> &
	Partial<Pick<T, 'id' | 'ts' | 'schema'>>

// ---------------------------------------------------------------------------
// Ids, hashing, canonical JSON
// ---------------------------------------------------------------------------

/**
 * Base36 width of the millisecond timestamp inside a record id. 8 base36 digits
 * cover milliseconds until year ~3769.
 * [UNCALIBRATED] — chosen for a fixed-width, lexicographically sortable id.
 */
const ID_TIME_WIDTH = 8

/**
 * Random suffix bytes in a record id. 4 bytes = 8 hex chars ≈ 4.3e9 values, which
 * makes a collision inside one millisecond effectively impossible at review volumes
 * (hundreds of records per campaign).
 * [UNCALIBRATED] — chosen here.
 */
const ID_RANDOM_BYTES = 4

/** Generate a record id: `<type-prefix>-<base36 ms>-<hex>`, lexicographically sortable within a type. */
export function newRecordId(
	type: RecordType,
	now: number = Date.now(),
	rand: (n: number) => Buffer = randomBytes,
): string {
	const time = Math.max(0, Math.floor(now)).toString(36).padStart(ID_TIME_WIDTH, '0')
	return `${ID_PREFIX[type]}-${time}-${rand(ID_RANDOM_BYTES).toString('hex')}`
}

/** Deterministic JSON with recursively sorted object keys — the input to every hash. */
export function canonicalStringify(value: unknown): string {
	return JSON.stringify(canonicalize(value))
}

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalize)
	if (value && typeof value === 'object') {
		const source = value as Record<string, unknown>
		const out: Record<string, unknown> = {}
		for (const key of Object.keys(source).sort()) {
			if (source[key] === undefined) continue
			out[key] = canonicalize(source[key])
		}
		return out
	}
	return value
}

/** sha256 hex of a string or buffer. */
export function sha256Hex(input: string | Uint8Array): string {
	return createHash('sha256').update(input).digest('hex')
}

/**
 * Content hash of a palette. Canonical JSON first, so key order and whitespace
 * cannot change the hash — a verdict is about the exact palette shown, so the hash
 * has to be a property of the content only.
 */
export function hashPalette(palette: PaletteSnapshot): string {
	return sha256Hex(canonicalStringify(palette))
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export class WarehouseFormatError extends Error {
	readonly path: string
	constructor(message: string, path: string) {
		super(path ? `${path}: ${message}` : message)
		this.name = 'WarehouseFormatError'
		this.path = path
	}
}

const SHA256_HEX = /^[0-9a-f]{64}$/
const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

function fail(message: string, path: string): never {
	throw new WarehouseFormatError(message, path)
}

function obj(value: unknown, path: string): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected an object', path)
	return value as Record<string, unknown>
}

function str(value: unknown, path: string, { allowEmpty = false } = {}): string {
	if (typeof value !== 'string') fail('expected a string', path)
	if (!allowEmpty && value.length === 0) fail('expected a non-empty string', path)
	return value
}

function bool(value: unknown, path: string): boolean {
	if (typeof value !== 'boolean') fail('expected a boolean', path)
	return value
}

function int(value: unknown, path: string): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
		fail('expected a non-negative integer', path)
	return value
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
	if (typeof value !== 'string' || !allowed.includes(value as T))
		fail(`expected one of ${allowed.join(' | ')}`, path)
	return value as T
}

function strArray(value: unknown, path: string): string[] {
	if (!Array.isArray(value)) fail('expected an array of strings', path)
	value.forEach((entry, i) => str(entry, `${path}[${i}]`))
	return value as string[]
}

function validateArtwork(value: unknown, path: string): void {
	const a = obj(value, path)
	const p = str(a.path, `${path}.path`)
	// Full path, never an id prefix (CONVENTIONS.md).
	if (!p.startsWith('/')) fail('expected an absolute path (identify artworks by full path)', `${path}.path`)
	if (!SHA256_HEX.test(str(a.sha256, `${path}.sha256`)))
		fail('expected 64 lowercase hex chars', `${path}.sha256`)
	const r = obj(a.rendition, `${path}.rendition`)
	int(r.width, `${path}.rendition.width`)
	int(r.height, `${path}.rendition.height`)
	int(r.bytes, `${path}.rendition.bytes`)
	str(r.format, `${path}.rendition.format`)
	str(r.collection, `${path}.rendition.collection`)
	if (r.artworkId !== null) str(r.artworkId, `${path}.rendition.artworkId`)
}

function validateFingerprint(value: unknown, path: string): void {
	const f = obj(value, path)
	str(f.algorithmVersion, `${path}.algorithmVersion`)
	str(f.preprocessingVersion, `${path}.preprocessingVersion`)
	str(f.gitCommit, `${path}.gitCommit`)
	bool(f.dirty, `${path}.dirty`)
}

function validateSide(value: unknown, path: string): void {
	const s = obj(value, path)
	str(s.paletteHash, `${path}.paletteHash`)
	str(s.variantId, `${path}.variantId`)
	validateFingerprint(s.fingerprint, `${path}.fingerprint`)
}

function validateBatchRef(value: unknown, path: string): void {
	const b = obj(value, path)
	str(b.id, `${path}.id`)
	oneOf(b.purpose, BATCH_PURPOSES, `${path}.purpose`)
	int(b.itemCount, `${path}.itemCount`)
	strArray(b.fundedBy, `${path}.fundedBy`)
}

function validateOptionalBatchRef(value: unknown, path: string): void {
	if (value !== null) validateBatchRef(value, path)
}

/**
 * Validate one parsed record. Throws WarehouseFormatError on anything malformed or
 * from an unknown schema version — v2-3 records are rejected here, by construction.
 */
export function validateRecord(value: unknown, path = ''): asserts value is WarehouseRecord {
	const r = obj(value, path)
	const p = (field: string) => (path ? `${path}.${field}` : field)

	const type = oneOf(r.type, RECORD_TYPES, p('type'))
	str(r.id, p('id'))
	if (!ISO_TS.test(str(r.ts, p('ts')))) fail('expected ISO-8601 UTC with ms precision', p('ts'))
	const schema = str(r.schema, p('schema'))
	if (schema !== WAREHOUSE_SCHEMA_VERSION)
		fail(`unknown schema version ${JSON.stringify(schema)} (expected ${WAREHOUSE_SCHEMA_VERSION})`, p('schema'))
	const author = obj(r.author, p('author'))
	oneOf(author.kind, ['human', 'agent'] as const, p('author.kind'))
	str(author.id, p('author.id'))

	switch (type) {
		case 'verdict': {
			const mode = oneOf(r.mode, VERDICT_MODES, p('mode'))
			validateBatchRef(r.batch, p('batch'))
			str(r.itemId, p('itemId'))
			validateArtwork(r.artwork, p('artwork'))
			validateSide(r.sideA, p('sideA'))
			oneOf(r.gradeA, GRADES, p('gradeA'))
			str(r.comment, p('comment'), { allowEmpty: true })
			const confound = bool(r.confound, p('confound'))
			if (confound) str(r.confoundNote, p('confoundNote'))
			else if (r.confoundNote !== null) str(r.confoundNote, p('confoundNote'))
			if (mode === 'pairwise') {
				validateSide(r.sideB, p('sideB'))
				oneOf(r.gradeB, GRADES, p('gradeB'))
				oneOf(r.preference, PREFERENCES, p('preference'))
			} else {
				if (r.sideB !== null) fail('absolute verdicts carry no side B', p('sideB'))
				if (r.gradeB !== null) fail('absolute verdicts carry no grade B', p('gradeB'))
				if (r.preference !== null) fail('absolute verdicts carry no preference', p('preference'))
			}
			return
		}
		case 'note': {
			validateOptionalBatchRef(r.batch, p('batch'))
			if (r.itemId !== null) str(r.itemId, p('itemId'))
			if (r.artwork !== null) validateArtwork(r.artwork, p('artwork'))
			str(r.text, p('text'), { allowEmpty: true })
			strArray(r.tags, p('tags'))
			if (r.derived !== null) {
				const d = obj(r.derived, p('derived'))
				str(d.fromRecordId, p('derived.fromRecordId'))
				str(d.agent, p('derived.agent'))
				str(d.agentVersion, p('derived.agentVersion'))
			}
			return
		}
		case 'endorsed-sample': {
			validateOptionalBatchRef(r.batch, p('batch'))
			if (r.itemId !== null) str(r.itemId, p('itemId'))
			validateArtwork(r.artwork, p('artwork'))
			obj(r.palette, p('palette'))
			str(r.paletteHash, p('paletteHash'))
			if (r.basedOnPaletteHash !== null) str(r.basedOnPaletteHash, p('basedOnPaletteHash'))
			str(r.comment, p('comment'), { allowEmpty: true })
			return
		}
		case 'veto': {
			validateOptionalBatchRef(r.batch, p('batch'))
			if (r.itemId !== null) str(r.itemId, p('itemId'))
			validateArtwork(r.artwork, p('artwork'))
			str(r.reason, p('reason'))
			oneOf(r.scope, VETO_SCOPES, p('scope'))
			return
		}
		case 'amendment': {
			str(r.targetId, p('targetId'))
			obj(r.patch, p('patch'))
			bool(r.retract, p('retract'))
			str(r.reason, p('reason'))
			return
		}
		case 'batch-complete': {
			str(r.batchId, p('batchId'))
			if (r.purpose !== null) oneOf(r.purpose, BATCH_PURPOSES, p('purpose'))
			if (r.itemCount !== null) int(r.itemCount, p('itemCount'))
			strArray(r.fundedBy, p('fundedBy'))
			if (r.releasedItemIds !== null) strArray(r.releasedItemIds, p('releasedItemIds'))
			str(r.note, p('note'), { allowEmpty: true })
			return
		}
		case 'oracle-label': {
			str(r.imageId, p('imageId'))
			if (r.artwork !== null) validateArtwork(r.artwork, p('artwork'))
			str(r.labelSchemaVersion, p('labelSchemaVersion'))
			str(r.questionKey, p('questionKey'))
			const answer = r.answer
			const answerOk =
				typeof answer === 'string' ||
				typeof answer === 'boolean' ||
				typeof answer === 'number' ||
				(Array.isArray(answer) && answer.every((a) => typeof a === 'string'))
			if (!answerOk) fail('expected a string, boolean, number, or string array', p('answer'))
			if (r.confidence !== null) oneOf(r.confidence, CONFIDENCE_LEVELS, p('confidence'))
			if (r.ambiguityNote !== null) str(r.ambiguityNote, p('ambiguityNote'), { allowEmpty: true })
			if (r.stratum !== null) str(r.stratum, p('stratum'))
			validateOptionalBatchRef(r.batch, p('batch'))
			return
		}
	}
}

/**
 * Check that an amendment's patch only touches fields the target's type allows.
 * Throws WarehouseFormatError naming the offending field.
 */
export function assertAmendablePatch(targetType: RecordType, patch: Record<string, unknown>): void {
	const allowed = AMENDABLE_FIELDS[targetType]
	for (const field of Object.keys(patch)) {
		if (!allowed.includes(field))
			fail(
				`field ${JSON.stringify(field)} is not amendable on a ${targetType} record ` +
					`(allowed: ${allowed.length ? allowed.join(', ') : 'none'})`,
				'patch',
			)
	}
}

/**
 * Marker for a smoke-test fixture record: the algorithm version a demo batch stamps
 * on both sides of its verdicts.
 *
 * The live warehouse carries two such batches (`demo-batch-0001`,
 * `demo-calibration-0001`) written while the review server was being built. They are
 * authored `{kind:"human", id:"flo"}` and carry real artwork paths, so nothing else
 * in the record distinguishes them from ground truth. Counting them as reviewer
 * judgments is how "how many verdicts exist in v3" gets answered `8` when the honest
 * answer is `0`.
 * [MEASURED] — the only two algorithmVersion values on any verdict in
 * `data/warehouse/warehouse.jsonl` are `demo-fixture-alpha` and `demo-fixture-bravo`
 * (2026-08-03; adversarial review F6).
 */
export const DEMO_FIXTURE_ALGORITHM_PREFIX = 'demo-fixture-'

/**
 * A git commit of 40 identical characters is a placeholder, not a commit — the demo
 * batches use `0000…` and `1111…`. Real hashes never take this form.
 *
 * Deliberately NOT a demo test on its own. `fixtures.ts` also stamps `0`×40, and a
 * bulk import written before the commit was known could too; excluding a record from
 * the ground-truth count on this evidence alone would hide real reviewer work, which
 * is the expensive direction. It is reported separately instead (`status`
 * `placeholder-commits=`), so it is never invisible.
 * [MEASURED] — both placeholder commits observed on the live demo batches (2026-08-03).
 */
export const PLACEHOLDER_COMMIT = /^(.)\1{39}$/

/** Every code fingerprint carried by a record (both sides of a verdict; none elsewhere). */
export function recordFingerprints(record: WarehouseRecord): CodeFingerprint[] {
	if (record.type !== 'verdict') return []
	const sides: Array<VerdictSide | null> = [record.sideA, record.sideB]
	return sides.filter((side): side is VerdictSide => side !== null).map((side) => side.fingerprint)
}

/**
 * True when the record is a demo/smoke-test fixture rather than reviewer ground
 * truth. Read-path only: the file is never modified and these records stay in the
 * log — they are simply not counted as evidence.
 */
export function isDemoFixtureRecord(record: WarehouseRecord): boolean {
	return recordFingerprints(record).some((f) => f.algorithmVersion.startsWith(DEMO_FIXTURE_ALGORITHM_PREFIX))
}

/** True when any fingerprint on the record carries a placeholder git commit. */
export function hasPlaceholderCommit(record: WarehouseRecord): boolean {
	return recordFingerprints(record).some((f) => PLACEHOLDER_COMMIT.test(f.gitCommit))
}

/** The batch a record belongs to, or null when it belongs to none. */
export function recordBatchId(record: WarehouseRecord): string | null {
	if (record.type === 'batch-complete') return record.batchId
	if (record.type === 'amendment') return null
	const batch = (record as { batch?: BatchRef | null }).batch
	return batch ? batch.id : null
}

/** The artwork a record is about, or null. */
export function recordArtwork(record: WarehouseRecord): ArtworkIdentity | null {
	const artwork = (record as { artwork?: ArtworkIdentity | null }).artwork
	return artwork ?? null
}
