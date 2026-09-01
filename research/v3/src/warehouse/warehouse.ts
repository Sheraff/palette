/**
 * V3 verdict warehouse — the library.
 *
 * Append-only JSONL, one record per line, flushed per record. Nothing is edited in
 * place; corrections are `amendment` records and the latest amendment wins at query
 * time (REVIEW_UI.md §1). Agents never read the file wholesale — they go through
 * `cli.ts`. This module is what the CLI and the review server call.
 */

import { closeSync, createReadStream, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeSync } from 'node:fs'
import { dirname } from 'node:path'
import { createInterface } from 'node:readline'
import {
	AMENDABLE_FIELDS,
	assertAmendablePatch,
	hasPlaceholderCommit,
	isDemoFixtureRecord,
	newRecordId,
	recordArtwork,
	recordBatchId,
	validateRecord,
	WAREHOUSE_SCHEMA_VERSION,
	WarehouseFormatError,
	type AmendmentRecord,
	type BatchCompleteRecord,
	type BatchPurpose,
	type OracleLabelRecord,
	type RecordInput,
	type RecordType,
	type VerdictRecord,
	type WarehouseRecord,
} from './records.ts'

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export interface AppendOptions {
	/** Clock injection point, for deterministic tests. */
	now?: () => number
	/** Id factory injection point, for deterministic tests. */
	idFactory?: (type: RecordType, now: number) => string
	/**
	 * fsync after every record. Default true: the reviewer's session and the
	 * orchestrator's watcher are separate processes, and a lost verdict is a lost
	 * human judgment — the most expensive thing in this project.
	 */
	fsync?: boolean
	/** Validate before writing. Default true. Turn off only for bulk replay of known-good records. */
	validate?: boolean
	/**
	 * For amendments: read the log to check the target exists and the patch only
	 * touches amendable fields of the target's type. Default true (amendments are rare).
	 */
	verifyAmendmentTarget?: boolean
}

/** Field order in the serialized line — the identifying fields come first so a raw `grep` reads well. */
const LINE_KEY_ORDER = ['id', 'type', 'ts', 'schema', 'author'] as const

function serializeRecord(record: WarehouseRecord): string {
	const ordered: Record<string, unknown> = {}
	for (const key of LINE_KEY_ORDER) ordered[key] = (record as unknown as Record<string, unknown>)[key]
	for (const key of Object.keys(record)) {
		if ((LINE_KEY_ORDER as readonly string[]).includes(key)) continue
		ordered[key] = (record as unknown as Record<string, unknown>)[key]
	}
	return JSON.stringify(ordered)
}

/**
 * Append one record. Fills in `id`, `ts` and `schema` when absent, validates, and
 * writes a single line, flushed immediately. Returns the stored record.
 */
export function append<T extends WarehouseRecord>(file: string, input: RecordInput<T>, options: AppendOptions = {}): T {
	const nowMs = (options.now ?? Date.now)()
	const record = {
		...(input as object),
		id: input.id ?? (options.idFactory ?? newRecordId)(input.type as RecordType, nowMs),
		ts: input.ts ?? new Date(nowMs).toISOString(),
		schema: input.schema ?? WAREHOUSE_SCHEMA_VERSION,
	} as T

	if (options.validate !== false) validateRecord(record)

	if (record.type === 'amendment' && options.verifyAmendmentTarget !== false) {
		verifyAmendment(file, record as AmendmentRecord)
	}

	const line = `${serializeRecord(record)}\n`
	mkdirSync(dirname(file), { recursive: true })
	const fd = openSync(file, 'a')
	try {
		writeSync(fd, line, null, 'utf8')
		if (options.fsync !== false) fsyncSync(fd)
	} finally {
		closeSync(fd)
	}
	return record
}

/** Append several records in order. Each is flushed as it is written. */
export function appendMany(file: string, inputs: RecordInput[], options: AppendOptions = {}): WarehouseRecord[] {
	return inputs.map((input) => append(file, input, options))
}

function verifyAmendment(file: string, amendment: AmendmentRecord): void {
	const existing = existsSync(file) ? readAll(file) : []
	const byId = new Map(existing.map((r) => [r.id, r]))
	let target = byId.get(amendment.targetId)
	if (!target) throw new WarehouseFormatError(`amendment target ${amendment.targetId} not found`, 'targetId')
	const seen = new Set<string>([amendment.id])
	while (target && target.type === 'amendment') {
		if (seen.has(target.id)) throw new WarehouseFormatError(`amendment chain cycle at ${target.id}`, 'targetId')
		seen.add(target.id)
		target = byId.get(target.targetId)
	}
	if (!target) throw new WarehouseFormatError(`amendment chain from ${amendment.targetId} has no root record`, 'targetId')
	assertAmendablePatch(target.type, amendment.patch)
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface ReadOptions {
	/**
	 * Called for a line that will not parse or will not validate, instead of throwing.
	 * Use to survive a partially written last line; without it, a bad line throws.
	 */
	onError?: (error: Error, lineNumber: number, raw: string) => void
	/** Validate every line. Default true — this is what rejects old-format records. */
	validate?: boolean
}

function parseLine(raw: string, lineNumber: number, validate: boolean): WarehouseRecord {
	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch (error) {
		throw new WarehouseFormatError(`line ${lineNumber}: not JSON (${(error as Error).message})`, '')
	}
	if (validate) {
		try {
			validateRecord(parsed)
		} catch (error) {
			throw new WarehouseFormatError(`line ${lineNumber}: ${(error as Error).message}`, '')
		}
	}
	return parsed as WarehouseRecord
}

/** Read every record, in append order. A missing file reads as empty. */
export function readAll(file: string, options: ReadOptions = {}): WarehouseRecord[] {
	if (!existsSync(file)) return []
	const out: WarehouseRecord[] = []
	const lines = readFileSync(file, 'utf8').split('\n')
	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i]!.trim()
		if (!raw) continue
		try {
			out.push(parseLine(raw, i + 1, options.validate !== false))
		} catch (error) {
			if (!options.onError) throw error
			options.onError(error as Error, i + 1, raw)
		}
	}
	return out
}

/**
 * Stream records without holding the file in memory. Same semantics as `readAll`.
 * Used by the CLI for `tail` and by anything that grows past comfortable read sizes.
 */
export async function* readRecords(file: string, options: ReadOptions = {}): AsyncGenerator<WarehouseRecord> {
	if (!existsSync(file)) return
	const input = createReadStream(file, 'utf8')
	const reader = createInterface({ input, crlfDelay: Infinity })
	let lineNumber = 0
	try {
		for await (const line of reader) {
			lineNumber++
			const raw = line.trim()
			if (!raw) continue
			try {
				yield parseLine(raw, lineNumber, options.validate !== false)
			} catch (error) {
				if (!options.onError) throw error
				options.onError(error as Error, lineNumber, raw)
			}
		}
	} finally {
		reader.close()
		input.destroy()
	}
}

// ---------------------------------------------------------------------------
// Amendment resolution
// ---------------------------------------------------------------------------

export interface Resolved<T extends WarehouseRecord = WarehouseRecord> {
	/** The record with every amendment in its chain applied, latest wins. */
	record: T
	/** The record exactly as appended. */
	original: T
	/** Amendments in applied order (oldest first). Empty when never amended. */
	amendments: AmendmentRecord[]
	/** True when an amendment retracted the record; it must fund nothing. */
	retracted: boolean
	/** Timestamp of the newest amendment, or null. */
	lastAmendedAt: string | null
	/** Fields replaced by at least one amendment, in first-changed order. */
	changedFields: string[]
	/**
	 * Patch fields refused at query time because AMENDABLE_FIELDS does not allow them
	 * on this record's type. Empty on every well-formed chain. Never applied — see
	 * `resolve`.
	 */
	integrityErrors: AmendmentIntegrityError[]
}

/**
 * A stored amendment whose patch reaches outside AMENDABLE_FIELDS for its target's
 * type — identity, provenance, or the palettes actually shown.
 *
 * `append()` refuses these, but the warehouse is a plain file written by several
 * tools, edited by agents and merged in git, and `append()` itself has a documented
 * escape hatch (`verifyAmendmentTarget: false`). So the allowlist is enforced at the
 * read door too: the offending fields are dropped, never applied, and reported here.
 */
export interface AmendmentIntegrityError {
	amendmentId: string
	targetId: string
	rootId: string
	targetType: RecordType
	/** Patch fields that were refused, in patch order. */
	rejectedFields: string[]
	reason: string
}

/** Amendment order: by timestamp, ties broken by append order. */
function amendmentOrder(a: { ts: string; index: number }, b: { ts: string; index: number }): number {
	if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1
	return a.index - b.index
}

/**
 * Apply amendments; the latest wins.
 *
 * An amendment may target the original record or a previous amendment of it. Both
 * forms land in the same chain: every amendment is walked up to its root record and
 * the whole group is applied in timestamp order. Amendment records themselves are
 * not returned. Amendments whose chain has no root record are dropped here — see
 * `findOrphanAmendments`.
 *
 * The AMENDABLE_FIELDS allowlist is enforced here as well as in `append()`. A patch
 * field that is not amendable on the root's type is **not applied**; it is collected
 * into `integrityErrors` so `status` and `query` can say so out loud. A record's
 * identity, provenance and shown palettes therefore cannot be rewritten by anything
 * that lands in the file, whatever wrote it.
 */
export function resolve(records: Iterable<WarehouseRecord>, options: { includeRetracted?: boolean } = {}): Resolved[] {
	const all = [...records]
	const byId = new Map(all.map((r) => [r.id, r]))
	const rootOf = new Map<string, string>()

	for (const record of all) {
		if (record.type !== 'amendment') continue
		const root = findRoot(record, byId)
		if (root) rootOf.set(record.id, root)
	}

	const grouped = new Map<string, Array<{ amendment: AmendmentRecord; index: number }>>()
	all.forEach((record, index) => {
		if (record.type !== 'amendment') return
		const root = rootOf.get(record.id)
		if (!root) return
		const list = grouped.get(root) ?? []
		list.push({ amendment: record, index })
		grouped.set(root, list)
	})

	const out: Resolved[] = []
	for (const record of all) {
		if (record.type === 'amendment') continue
		const entries = (grouped.get(record.id) ?? []).sort((x, y) =>
			amendmentOrder({ ts: x.amendment.ts, index: x.index }, { ts: y.amendment.ts, index: y.index }),
		)
		let current: WarehouseRecord = record
		let retracted = false
		const changed: string[] = []
		const integrityErrors: AmendmentIntegrityError[] = []
		for (const { amendment } of entries) {
			const { applied, rejected } = splitPatch(record.type, amendment.patch)
			if (rejected.length)
				integrityErrors.push({
					amendmentId: amendment.id,
					targetId: amendment.targetId,
					rootId: record.id,
					targetType: record.type,
					rejectedFields: rejected,
					reason: `not amendable on a ${record.type} record (allowed: ${
						AMENDABLE_FIELDS[record.type].length ? AMENDABLE_FIELDS[record.type].join(', ') : 'none'
					})`,
				})
			current = { ...current, ...applied } as WarehouseRecord
			for (const field of Object.keys(applied)) if (!changed.includes(field)) changed.push(field)
			if (amendment.retract) retracted = true
		}
		const amendments = entries.map((e) => e.amendment)
		if (retracted && options.includeRetracted === false) continue
		out.push({
			record: current,
			original: record,
			amendments,
			retracted,
			lastAmendedAt: amendments.length ? amendments[amendments.length - 1]!.ts : null,
			changedFields: changed,
			integrityErrors,
		})
	}
	return out
}

function findRoot(amendment: AmendmentRecord, byId: Map<string, WarehouseRecord>): string | null {
	const seen = new Set<string>([amendment.id])
	let cursor = byId.get(amendment.targetId)
	while (cursor && cursor.type === 'amendment') {
		if (seen.has(cursor.id)) return null // cycle
		seen.add(cursor.id)
		cursor = byId.get(cursor.targetId)
	}
	return cursor ? cursor.id : null
}

/** Split a patch into the fields the target's type allows and the fields it does not. */
function splitPatch(
	targetType: RecordType,
	patch: Record<string, unknown>,
): { applied: Record<string, unknown>; rejected: string[] } {
	const allowed = AMENDABLE_FIELDS[targetType]
	const applied: Record<string, unknown> = {}
	const rejected: string[] = []
	for (const field of Object.keys(patch)) {
		if (allowed.includes(field)) applied[field] = patch[field]
		else rejected.push(field)
	}
	return { applied, rejected }
}

/**
 * Amendments in the log whose patch reaches outside the allowlist for their target's
 * type. The read-side counterpart of `findOrphanAmendments`: both name a class of
 * record that is present in the file and refused at query time.
 */
export function findInvalidAmendments(records: Iterable<WarehouseRecord>): AmendmentIntegrityError[] {
	return resolve(records).flatMap((entry) => entry.integrityErrors)
}

/** Amendments whose target is missing or whose chain cycles — nothing applies them. */
export function findOrphanAmendments(records: Iterable<WarehouseRecord>): AmendmentRecord[] {
	const all = [...records]
	const byId = new Map(all.map((r) => [r.id, r]))
	return all.filter((r): r is AmendmentRecord => r.type === 'amendment' && findRoot(r, byId) === null)
}

/** Map of record id → resolved record, for lookups. */
export function resolveById(records: Iterable<WarehouseRecord>): Map<string, Resolved> {
	return new Map(resolve(records).map((entry) => [entry.original.id, entry]))
}

/**
 * Verdicts that a later verdict on the same (batch, item) replaced.
 *
 * Before release, every item stays freely editable with zero ceremony
 * (REVIEW_UI.md §1). Each save appends a record — the log is append-only — so one
 * item can carry several verdicts. The last one is the reviewer's position; the
 * earlier ones are drafts. They are never deleted (they are evidence about the
 * reviewer's process), but nothing downstream may count them twice.
 */
export function supersededVerdictIds(entries: Resolved[]): Set<string> {
	return supersededByKey(entries, (entry) =>
		entry.record.type === 'verdict' ? `${entry.record.batch.id} ${entry.record.itemId}` : null,
	)
}

/**
 * Oracle labels that a later answer to the same question about the same item
 * replaced.
 *
 * The by-question passes are keyboard-driven with undo (REVIEW_UI.md §6), so
 * re-answering appends a second record; the earlier one is undo, not extra evidence.
 * Keyed by batch + image + question, matching `analyze-bracketing.ts`
 * `collectAnswers`. For these rounds the image id *is* the batch's item id (the
 * review server writes the item id into `imageId`).
 */
export function supersededOracleLabelIds(entries: Resolved[]): Set<string> {
	return supersededByKey(entries, (entry) =>
		entry.record.type === 'oracle-label'
			? `${entry.record.batch?.id ?? NO_BATCH} ${entry.record.imageId} ${entry.record.questionKey}`
			: null,
	)
}

/** Everything replaced by a later record on the same item — verdicts and oracle labels. */
export function supersededIds(entries: Resolved[]): Set<string> {
	return new Set([...supersededVerdictIds(entries), ...supersededOracleLabelIds(entries)])
}

/**
 * The reviewer's standing position per item: for each key the latest non-retracted
 * record wins, ties broken by append order.
 *
 * A retracted record is never the position and never supersedes anything —
 * withdrawing a re-answer leaves the previous answer standing. This matches the
 * review server (`server.ts` `#verdicts` / `#answers`, where a retracted record
 * keeps the previous state as the position) and `analyze-bracketing.ts`
 * `collectAnswers` (which drops retracted records before choosing the latest).
 */
function supersededByKey(entries: Resolved[], keyOf: (entry: Resolved) => string | null): Set<string> {
	const latest = new Map<string, { id: string; ts: string; index: number }>()
	const superseded = new Set<string>()
	entries.forEach((entry, index) => {
		if (entry.retracted) return
		const key = keyOf(entry)
		if (key === null) return
		const ts = entry.record.ts
		const current = latest.get(key)
		if (!current || current.ts < ts || (current.ts === ts && current.index < index)) {
			if (current) superseded.add(current.id)
			latest.set(key, { id: entry.original.id, ts, index })
		} else {
			superseded.add(entry.original.id)
		}
	})
	return superseded
}

/** Grades keyed by what each side actually was, so adjudication never needs the blinding key. */
export function gradesByVariant(verdict: VerdictRecord): Record<string, string> {
	const out: Record<string, string> = { [verdict.sideA.variantId]: verdict.gradeA }
	if (verdict.sideB && verdict.gradeB) out[verdict.sideB.variantId] = verdict.gradeB
	return out
}

/** The variant the reviewer preferred, or null for "no preference" and absolute verdicts. */
export function preferredVariant(verdict: VerdictRecord): string | null {
	if (verdict.preference === 'a') return verdict.sideA.variantId
	if (verdict.preference === 'b') return verdict.sideB ? verdict.sideB.variantId : null
	return null
}

// ---------------------------------------------------------------------------
// funded-by re-check
// ---------------------------------------------------------------------------

/**
 * A downstream decision (adjudication, integration) that recorded which verdicts
 * funded it. Supplied by the caller — decisions live in the workstream that made
 * them, not in the warehouse.
 */
export interface FundedDecision {
	id: string
	/** When the decision was made. Amendments after this are what make it stale. */
	ts?: string
	/** Free label: "integration", "adjudication", an arm name. */
	kind?: string
	/** Record ids (normally verdicts) that funded the decision. */
	fundedBy: string[]
}

export interface StaleEvidence {
	recordId: string
	amendedAt: string
	amendmentIds: string[]
	changedFields: string[]
	retracted: boolean
}

/** A funded record replaced by a later record on the same item. */
export interface SupersededEvidence {
	recordId: string
	/** The record that replaced it — the reviewer's standing position on that item. */
	replacedById: string
	/** Batch + item key the two records share. */
	itemKey: string
	/** When the replacement was written. */
	replacedAt: string
}

export interface RecheckHit {
	decisionId: string
	decisionTs: string | null
	kind: string | null
	/** Evidence amended after the decision was made. */
	stale: StaleEvidence[]
	/**
	 * Evidence that is retracted, whenever the retraction happened — a retracted
	 * record must fund nothing (`records.ts`), including when it was already withdrawn
	 * at citation time.
	 */
	retracted: string[]
	/** Evidence the reviewer re-answered: a later record on the same item stands instead. */
	superseded: SupersededEvidence[]
	/** fundedBy ids that are not in the warehouse at all. */
	missing: string[]
}

/**
 * The standing gate query (REVIEW_UI.md §1): given decisions that list the record ids
 * that funded them, return the decisions whose evidence has moved under them.
 *
 * Four ways evidence moves, all reported:
 *
 * - **amended since** (`stale`) — relative to the decision's own timestamp when it has
 *   one; an amendment that predates the decision was already accounted for. A decision
 *   without a timestamp is treated as funded by whatever the evidence said originally,
 *   so any amendment at all flags it.
 * - **retracted** — regardless of when. A retraction that *predates* the decision is
 *   the one case a since-filter is guaranteed to miss, and citing evidence that was
 *   already withdrawn is worse than citing evidence that moved afterwards, not better.
 * - **superseded** — the reviewer re-answered the item, so the cited record is a draft
 *   and a different record carries their position. This is the channel the reviewer
 *   actually uses: in the live warehouse every amendment is an agent-authored
 *   retraction of a derived note and there are zero reviewer amendments, while 11
 *   records are superseded by re-answers (2026-08-03).
 * - **missing** — not in the warehouse at all.
 */
export function recheckFundedBy(decisions: Iterable<FundedDecision>, records: Iterable<WarehouseRecord>): RecheckHit[] {
	const entries = resolve(records)
	const resolved = new Map(entries.map((entry) => [entry.original.id, entry]))
	const standing = standingPositions(entries)
	const hits: RecheckHit[] = []

	for (const decision of decisions) {
		const stale: StaleEvidence[] = []
		const retracted: string[] = []
		const superseded: SupersededEvidence[] = []
		const missing: string[] = []
		for (const recordId of decision.fundedBy) {
			const entry = resolved.get(recordId)
			if (!entry) {
				missing.push(recordId)
				continue
			}
			if (entry.retracted) retracted.push(recordId)
			const replacement = standing.get(recordId)
			if (replacement) superseded.push({ recordId, ...replacement })
			const since = decision.ts
				? entry.amendments.filter((a) => a.ts > decision.ts!)
				: entry.amendments
			if (!since.length) continue
			const changed: string[] = []
			for (const amendment of since)
				for (const field of Object.keys(amendment.patch)) if (!changed.includes(field)) changed.push(field)
			stale.push({
				recordId,
				amendedAt: since[since.length - 1]!.ts,
				amendmentIds: since.map((a) => a.id),
				changedFields: changed,
				retracted: since.some((a) => a.retract),
			})
		}
		if (stale.length || retracted.length || superseded.length || missing.length)
			hits.push({
				decisionId: decision.id,
				decisionTs: decision.ts ?? null,
				kind: decision.kind ?? null,
				stale,
				retracted,
				superseded,
				missing,
			})
	}
	return hits
}

/**
 * For every superseded record, which record replaced it and on what item key.
 * `supersededIds` answers "was this replaced"; the gate also has to be able to say
 * *by what*, so a reader can go and look at the standing answer.
 */
function standingPositions(
	entries: Resolved[],
): Map<string, { replacedById: string; itemKey: string; replacedAt: string }> {
	const out = new Map<string, { replacedById: string; itemKey: string; replacedAt: string }>()
	const byKey = new Map<string, Resolved[]>()
	for (const entry of entries) {
		if (entry.retracted) continue
		const key = itemKeyOf(entry)
		if (key === null) continue
		const list = byKey.get(key) ?? []
		list.push(entry)
		byKey.set(key, list)
	}
	const superseded = supersededIds(entries)
	for (const [key, list] of byKey) {
		const winner = list.find((entry) => !superseded.has(entry.original.id))
		if (!winner) continue
		for (const entry of list) {
			if (!superseded.has(entry.original.id)) continue
			out.set(entry.original.id, {
				replacedById: winner.original.id,
				itemKey: key,
				replacedAt: winner.record.ts,
			})
		}
	}
	return out
}

/** The (batch, item) key supersession uses, or null for records that have no item. */
function itemKeyOf(entry: Resolved): string | null {
	const record = entry.record
	if (record.type === 'verdict') return `${record.batch.id} ${record.itemId}`
	if (record.type === 'oracle-label')
		return `${record.batch?.id ?? NO_BATCH} ${record.imageId} ${record.questionKey}`
	return null
}

// ---------------------------------------------------------------------------
// Batch status
// ---------------------------------------------------------------------------

export interface BatchSummary {
	batchId: string
	purpose: BatchPurpose | null
	/** Batch size declared at push time, or null when no record carried it. */
	itemCount: number | null
	/**
	 * Distinct items that have been judged. An item counts when it carries the
	 * reviewer's standing position in any judging channel: a verdict, a veto, or an
	 * oracle label (bracketing and oracle-validation rounds produce labels, not
	 * verdicts). Retracted and superseded records do not count — a vetoed item is
	 * judged, because ruling an artwork out of the corpus is a decision, not a skip.
	 *
	 * What counts as one item for a label round is `labelUnit`.
	 */
	reviewed: number
	/**
	 * The unit `reviewed` counts for this batch's oracle labels, or null when the
	 * batch has none. `image-question` when the round asks more than one question —
	 * the batch then declares `itemCount = images × questions` and releases one item
	 * id per (question, image). `image` when it asks a single question.
	 */
	labelUnit: 'image' | 'image-question' | null
	/** itemCount − reviewed, or null when itemCount is unknown. */
	pending: number | null
	/** Timestamp of the batch-complete record, or null while the batch is open. */
	released: string | null
	/** Item ids named by the batch-complete manifest, or null when it named none. */
	releasedItemCount: number | null
	/**
	 * True when the batch is smoke-test fixture data, not reviewer ground truth
	 * (`isDemoFixtureRecord`). Its counts are reported separately and excluded from
	 * headline totals.
	 */
	demo: boolean
	/** Records in the batch carrying a placeholder git commit — reported, not excluded. */
	placeholderCommits: number
	verdicts: number
	notes: number
	endorsed: number
	vetoes: number
	labels: number
	/** Records in the batch carrying at least one amendment. */
	amended: number
	retracted: number
	firstTs: string
	lastTs: string
}

/** Placeholder batch id for records that belong to no batch. */
export const NO_BATCH = '-'

/**
 * Per-batch counts, in first-seen order. Records outside any batch are grouped
 * under NO_BATCH.
 */
export function batchSummaries(records: Iterable<WarehouseRecord>): BatchSummary[] {
	const all = [...records]
	const entries = resolve(all)
	const superseded = supersededIds(entries)
	const order: string[] = []
	const summaries = new Map<string, BatchSummary>()
	const reviewedItems = new Map<string, Set<string>>()
	/** Standing (image, question) answers per batch — keyed after the whole pass, see below. */
	const standingLabels = new Map<string, Array<{ imageId: string; questionKey: string }>>()

	const get = (batchId: string, ts: string): BatchSummary => {
		let summary = summaries.get(batchId)
		if (!summary) {
			summary = {
				batchId,
				purpose: null,
				itemCount: null,
				reviewed: 0,
				labelUnit: null,
				pending: null,
				released: null,
				releasedItemCount: null,
				demo: false,
				placeholderCommits: 0,
				verdicts: 0,
				notes: 0,
				endorsed: 0,
				vetoes: 0,
				labels: 0,
				amended: 0,
				retracted: 0,
				firstTs: ts,
				lastTs: ts,
			}
			summaries.set(batchId, summary)
			reviewedItems.set(batchId, new Set())
			standingLabels.set(batchId, [])
			order.push(batchId)
		}
		if (ts < summary.firstTs) summary.firstTs = ts
		if (ts > summary.lastTs) summary.lastTs = ts
		return summary
	}

	for (const entry of entries) {
		const record = entry.record
		const batchId = recordBatchId(record) ?? NO_BATCH
		const summary = get(batchId, record.ts)
		if (entry.amendments.length) summary.amended++
		if (entry.retracted) summary.retracted++
		// Demo-ness is a property of the batch: the release record of a demo batch
		// carries no fingerprint of its own, and a batch is either fixture data or it
		// is not.
		if (isDemoFixtureRecord(record)) summary.demo = true
		if (hasPlaceholderCommit(record)) summary.placeholderCommits++

		switch (record.type) {
			case 'verdict': {
				summary.verdicts++
				if (!entry.retracted && !superseded.has(entry.original.id))
					reviewedItems.get(batchId)!.add(record.itemId)
				if (summary.purpose === null) summary.purpose = record.batch.purpose
				if (summary.itemCount === null) summary.itemCount = record.batch.itemCount
				break
			}
			case 'note':
				summary.notes++
				break
			case 'endorsed-sample':
				summary.endorsed++
				break
			case 'veto':
				summary.vetoes++
				// A vetoed item is judged: the reviewer ruled it out of the corpus, which
				// is a decision, not a skip. It must not hold up the batch's release.
				if (!entry.retracted && record.itemId) reviewedItems.get(batchId)!.add(record.itemId)
				break
			case 'oracle-label':
				summary.labels++
				// A labelled item is judged. Oracle-validation and bracketing rounds produce
				// labels instead of verdicts, so without this a fully answered round would
				// report every item as pending and never look releasable. Which key counts
				// as one item depends on the round — decided below, once every answer in the
				// batch is known.
				if (!entry.retracted && !superseded.has(entry.original.id))
					standingLabels.get(batchId)!.push({ imageId: record.imageId, questionKey: record.questionKey })
				if (record.batch && summary.purpose === null) summary.purpose = record.batch.purpose
				if (record.batch && summary.itemCount === null) summary.itemCount = record.batch.itemCount
				break
			case 'batch-complete': {
				// The release record is the authoritative manifest; it wins over the
				// denormalized copies on the item records.
				summary.released = record.ts
				if (record.purpose !== null) summary.purpose = record.purpose
				if (record.itemCount !== null) summary.itemCount = record.itemCount
				if (record.releasedItemIds !== null) summary.releasedItemCount = record.releasedItemIds.length
				break
			}
		}
	}

	for (const summary of summaries.values()) {
		// An oracle round's unit of judgment is one answer to one question about one
		// image. When the round asks several questions it declares
		// `itemCount = images × questions` and releases one item id per (question,
		// image) — `pg-<questionKey>-<sha12>` — so keying reviewed items by image alone
		// tops out at the image count and reports the difference as pending forever.
		// (Measured 2026-08-03: that read invented 290 outstanding answers across
		// oracle-probe-gold-1 and bcde-validation-1, both fully answered and released.)
		// When the round asks a single question the two keys coincide, and the image is
		// also what the release manifest names (`gt-<sha12>`), so a label and a verdict
		// on the same item still count once.
		const labels = standingLabels.get(summary.batchId)!
		const questions = new Set(labels.map((label) => label.questionKey))
		summary.labelUnit = labels.length === 0 ? null : questions.size > 1 ? 'image-question' : 'image'
		const items = reviewedItems.get(summary.batchId)!
		for (const label of labels)
			items.add(summary.labelUnit === 'image-question' ? `${label.imageId} ${label.questionKey}` : label.imageId)

		summary.reviewed = items.size
		summary.pending = summary.itemCount === null ? null : Math.max(0, summary.itemCount - summary.reviewed)
	}

	return order.map((batchId) => summaries.get(batchId)!)
}

/** True when the batch has a batch-complete record — the release trigger. */
export function isBatchReleased(records: Iterable<WarehouseRecord>, batchId: string): boolean {
	for (const record of records) if (record.type === 'batch-complete' && record.batchId === batchId) return true
	return false
}

/** Batch ids that have verdicts but no release record yet. */
export function openBatches(records: Iterable<WarehouseRecord>): string[] {
	return batchSummaries(records)
		.filter((summary) => summary.batchId !== NO_BATCH && summary.released === null)
		.map((summary) => summary.batchId)
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export interface QueryFilter {
	types?: RecordType[]
	batchIds?: string[]
	itemIds?: string[]
	/** Matches an artwork sha256 prefix, a full path, or a path substring. */
	artwork?: string
	/** Inclusive lower bound on `ts`. */
	since?: string
	/** Exclusive upper bound on `ts`. */
	until?: string
	/** Only records whose confound flag matches. */
	confound?: boolean
	/** Drop retracted records. */
	excludeRetracted?: boolean
}

/**
 * Item ids published by `batch-complete` records, indexed batch → artwork hash
 * prefix → ids.
 *
 * Oracle-label records carry no `itemId` (703 of 703 in the live warehouse), but the
 * release record names every item by an id built from the artwork hash —
 * `gt-<sha12>` for a one-question round, `pg-<questionKey>-<sha12>` for a
 * per-question one. Indexing the manifest by that hash prefix is what lets a reader
 * hand `query --item` an id from a release record and get the answer back.
 */
export type ReleasedItemIndex = Map<string, Map<string, string[]>>

/** Number of hex chars of the artwork sha256 that oracle item ids embed. */
const ITEM_ID_HASH_CHARS = 12

export function releasedItemIndex(records: Iterable<WarehouseRecord>): ReleasedItemIndex {
	const index: ReleasedItemIndex = new Map()
	for (const record of records) {
		if (record.type !== 'batch-complete') continue
		const complete = record as BatchCompleteRecord
		if (!complete.releasedItemIds) continue
		const byHash = index.get(complete.batchId) ?? new Map<string, string[]>()
		for (const itemId of complete.releasedItemIds) {
			const hash = itemId.slice(-ITEM_ID_HASH_CHARS)
			const list = byHash.get(hash) ?? []
			list.push(itemId)
			byHash.set(hash, list)
		}
		index.set(complete.batchId, byHash)
	}
	return index
}

/**
 * Every item id this record can be addressed by: its own `itemId` when it has one,
 * otherwise the released ids that name it.
 *
 * When several released ids in the batch share an artwork the manifest is
 * per-question, and only the id carrying this record's question key names it. When
 * one id owns the artwork, the round asked a single question and that id names the
 * record whatever its question key is.
 */
export function addressableItemIds(record: WarehouseRecord, released?: ReleasedItemIndex): string[] {
	const own = (record as { itemId?: string | null }).itemId ?? null
	if (own) return [own]
	if (record.type !== 'oracle-label' || !released) return []
	const label = record as OracleLabelRecord
	if (!label.artwork || !label.batch) return []
	const candidates = released.get(label.batch.id)?.get(label.artwork.sha256.slice(0, ITEM_ID_HASH_CHARS)) ?? []
	if (candidates.length <= 1) return candidates
	return candidates.filter((itemId) => itemId.slice(0, -ITEM_ID_HASH_CHARS).endsWith(`-${label.questionKey}-`))
}

/**
 * Apply a filter to resolved records, preserving append order. Pass the released-item
 * index to let `itemIds` match records that carry no `itemId` of their own.
 */
export function filterResolved(entries: Resolved[], filter: QueryFilter, released?: ReleasedItemIndex): Resolved[] {
	return entries.filter((entry) => {
		const record = entry.record
		if (filter.excludeRetracted && entry.retracted) return false
		if (filter.types && !filter.types.includes(record.type)) return false
		if (filter.batchIds) {
			const batchId = recordBatchId(record)
			if (!batchId || !filter.batchIds.includes(batchId)) return false
		}
		if (filter.itemIds) {
			const itemIds = addressableItemIds(record, released)
			if (!itemIds.some((itemId) => filter.itemIds!.includes(itemId))) return false
		}
		if (filter.artwork) {
			const artwork = recordArtwork(record)
			const imageId = record.type === 'oracle-label' ? record.imageId : null
			const needle = filter.artwork
			const matches =
				(artwork !== null && (artwork.sha256.startsWith(needle) || artwork.path.includes(needle))) ||
				(imageId !== null && imageId.includes(needle))
			if (!matches) return false
		}
		if (filter.since && record.ts < filter.since) return false
		if (filter.until && record.ts >= filter.until) return false
		if (filter.confound !== undefined) {
			if (record.type !== 'verdict') return false
			if ((record as VerdictRecord).confound !== filter.confound) return false
		}
		return true
	})
}
