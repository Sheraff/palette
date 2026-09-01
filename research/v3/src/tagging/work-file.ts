/**
 * V3 tagging — the work file that travels between the warehouse and the tagging agent.
 *
 * `export-untagged.ts` writes one; a subagent fills in `tags` (and optionally `unsure`
 * and `note`) on each entry; `import-tags.ts` validates it and appends derived note
 * records. The format is deliberately flat and boring: a subagent has to be able to
 * edit it without a schema in front of it.
 *
 * One deliberate omission: **the work file never carries variant ids.** The warehouse
 * knows which side was trunk and which was an arm (`VerdictSide.variantId`), but the
 * tagging agent's job is to read the human's words, not to know which arm won.
 * Withholding it keeps the index free of any pressure to tag in a direction
 * (REVIEW_UI.md §2, blinding).
 */

import type { RecordType } from '../warehouse/records.ts'

/** File marker. A wrong `kind` is a hard error — it usually means the wrong file was passed. */
export const WORK_FILE_KIND = 'tagging-work-file'

/**
 * Work-file format version, independent of the vocabulary version and of the warehouse
 * schema version. Bump only when the entry shape changes.
 * [UNCALIBRATED] — chosen here.
 */
export const WORK_FILE_FORMAT_VERSION = '1'

/**
 * Default agent id stamped on derived records (`NoteRecord.derived.agent`) and on the
 * work file. One id per tagging pipeline, so a whole generation of derived records can
 * be found, dropped and rebuilt with one query.
 * [REVIEWED] — TAGGING_PROTOCOL.md.
 */
export const TAGGING_AGENT = 'tagging-agent'

/**
 * Record types whose free text is tagged by default. The reviewer's primary channel is
 * verdict comments and standalone notes (REVIEW_UI.md §4); the others carry free text
 * too and can be opted in with `--type`.
 * [REVIEWED] — Phase 0 tagging workstream brief ("all verdict/note free-text").
 */
export const DEFAULT_SOURCE_TYPES: RecordType[] = ['verdict', 'note']

/** Every record type that has a free-text field this pipeline can read. */
export const TAGGABLE_SOURCE_TYPES: RecordType[] = ['verdict', 'note', 'endorsed-sample', 'veto', 'batch-complete']

/**
 * Everything the tagger needs in order to disambiguate the text, and nothing else.
 * Read-only: the tagger never edits context, and `import-tags.ts` ignores it entirely
 * (it re-reads the source record from the warehouse).
 */
export interface WorkContext {
	batchId: string | null
	batchPurpose: string | null
	itemId: string | null
	artworkPath: string | null
	artworkSha256: string | null
	/** Verdicts only. */
	mode?: string
	gradeA?: string
	gradeB?: string | null
	preference?: string | null
	confound?: boolean
	/** Free text about the *other* side's unrelated defect; disambiguates the comment. */
	confoundNote?: string | null
	/** Source record timestamp, and the timestamp of its newest amendment. */
	sourceTs: string
	amendedAt: string | null
}

export interface WorkEntry {
	sourceId: string
	sourceType: RecordType
	/** The free text to tag. This is what the tagger reads; `context` only disambiguates it. */
	text: string
	context: WorkContext
	/** Filled by the tagger: zero or more vocabulary tag ids. Absent means "not yet done". */
	tags?: string[]
	/** Filled by the tagger: the mapping is ambiguous and a human should check it. */
	unsure?: boolean
	/** Filled by the tagger: one short line saying why these tags. Stored as the derived note's text. */
	note?: string
}

export interface WorkFile {
	kind: typeof WORK_FILE_KIND
	formatVersion: string
	/** Vocabulary the entries must be tagged against. Import refuses a mismatch by default. */
	vocabularyVersion: string
	agent: string
	generatedAt: string
	/** Warehouse the entries came from, for the operator's benefit. Import uses its own `--file`. */
	warehouse: string
	/** One line pointing at the protocol, so a stray work file explains itself. */
	instructions: string
	entries: WorkEntry[]
}

/** True when a tagger has touched the entry at all (even to say "no tags apply"). */
export function isFilled(entry: WorkEntry): boolean {
	return Array.isArray(entry.tags)
}

function bad(message: string): never {
	throw new Error(message)
}

/**
 * Parse and shape-check a work file. Does not look at the vocabulary or the warehouse —
 * `import-tags.ts` does that, because those checks need both.
 */
export function parseWorkFile(value: unknown, where = 'work file'): WorkFile {
	if (!value || typeof value !== 'object' || Array.isArray(value)) bad(`${where}: expected an object`)
	const raw = value as Record<string, unknown>
	if (raw.kind !== WORK_FILE_KIND) bad(`${where}: kind must be ${JSON.stringify(WORK_FILE_KIND)}, got ${JSON.stringify(raw.kind)}`)
	if (typeof raw.formatVersion !== 'string') bad(`${where}: formatVersion must be a string`)
	if (raw.formatVersion !== WORK_FILE_FORMAT_VERSION)
		bad(`${where}: unsupported formatVersion ${JSON.stringify(raw.formatVersion)} (expected ${WORK_FILE_FORMAT_VERSION})`)
	if (typeof raw.vocabularyVersion !== 'string' || !raw.vocabularyVersion) bad(`${where}: vocabularyVersion must be a non-empty string`)
	if (typeof raw.agent !== 'string' || !raw.agent) bad(`${where}: agent must be a non-empty string`)
	if (!Array.isArray(raw.entries)) bad(`${where}: entries must be an array`)

	const entries: WorkEntry[] = raw.entries.map((item, i) => {
		const at = `${where}.entries[${i}]`
		if (!item || typeof item !== 'object' || Array.isArray(item)) bad(`${at}: expected an object`)
		const entry = item as Record<string, unknown>
		if (typeof entry.sourceId !== 'string' || !entry.sourceId) bad(`${at}.sourceId: expected a non-empty string`)
		if (typeof entry.sourceType !== 'string') bad(`${at}.sourceType: expected a string`)
		if (typeof entry.text !== 'string') bad(`${at}.text: expected a string`)
		if (entry.tags !== undefined) {
			if (!Array.isArray(entry.tags)) bad(`${at}.tags: expected an array of tag ids`)
			entry.tags.forEach((tag, j) => {
				if (typeof tag !== 'string' || !tag) bad(`${at}.tags[${j}]: expected a non-empty string`)
			})
		}
		if (entry.unsure !== undefined && typeof entry.unsure !== 'boolean') bad(`${at}.unsure: expected a boolean`)
		if (entry.note !== undefined && typeof entry.note !== 'string') bad(`${at}.note: expected a string`)
		if (!entry.context || typeof entry.context !== 'object') bad(`${at}.context: expected an object`)
		return entry as unknown as WorkEntry
	})

	return {
		kind: WORK_FILE_KIND,
		formatVersion: raw.formatVersion,
		vocabularyVersion: raw.vocabularyVersion,
		agent: raw.agent,
		generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : '',
		warehouse: typeof raw.warehouse === 'string' ? raw.warehouse : '',
		instructions: typeof raw.instructions === 'string' ? raw.instructions : '',
		entries,
	}
}
