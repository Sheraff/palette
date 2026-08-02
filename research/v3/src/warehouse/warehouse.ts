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
	assertAmendablePatch,
	newRecordId,
	recordArtwork,
	recordBatchId,
	validateRecord,
	WAREHOUSE_SCHEMA_VERSION,
	WarehouseFormatError,
	type AmendmentRecord,
	type BatchPurpose,
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
		for (const { amendment } of entries) {
			current = { ...current, ...amendment.patch } as WarehouseRecord
			for (const field of Object.keys(amendment.patch)) if (!changed.includes(field)) changed.push(field)
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
	const latest = new Map<string, { id: string; ts: string; index: number }>()
	const superseded = new Set<string>()
	entries.forEach((entry, index) => {
		const record = entry.record
		if (record.type !== 'verdict') return
		const key = `${record.batch.id} ${record.itemId}`
		const current = latest.get(key)
		if (!current || current.ts < record.ts || (current.ts === record.ts && current.index < index)) {
			if (current) superseded.add(current.id)
			latest.set(key, { id: entry.original.id, ts: record.ts, index })
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

export interface RecheckHit {
	decisionId: string
	decisionTs: string | null
	kind: string | null
	/** Evidence amended after the decision was made. */
	stale: StaleEvidence[]
	/** fundedBy ids that are not in the warehouse at all. */
	missing: string[]
}

/**
 * The standing gate query (REVIEW_UI.md §1): given decisions that list the verdict
 * ids that funded them, return the decisions funded by since-amended evidence.
 *
 * "Since" is relative to the decision's own timestamp when it has one — an amendment
 * that predates the decision was already accounted for. A decision without a
 * timestamp is treated as funded by whatever the evidence said originally, so any
 * amendment at all flags it.
 */
export function recheckFundedBy(decisions: Iterable<FundedDecision>, records: Iterable<WarehouseRecord>): RecheckHit[] {
	const resolved = resolveById(records)
	const hits: RecheckHit[] = []

	for (const decision of decisions) {
		const stale: StaleEvidence[] = []
		const missing: string[] = []
		for (const recordId of decision.fundedBy) {
			const entry = resolved.get(recordId)
			if (!entry) {
				missing.push(recordId)
				continue
			}
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
		if (stale.length || missing.length)
			hits.push({
				decisionId: decision.id,
				decisionTs: decision.ts ?? null,
				kind: decision.kind ?? null,
				stale,
				missing,
			})
	}
	return hits
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
	 * Distinct item ids that have been judged: a non-superseded, non-retracted verdict
	 * OR a non-retracted veto. A vetoed item is judged — the reviewer ruled it out of
	 * the corpus, which is a decision, not a skip — so it does not hold up release.
	 */
	reviewed: number
	/** itemCount − reviewed, or null when itemCount is unknown. */
	pending: number | null
	/** Timestamp of the batch-complete record, or null while the batch is open. */
	released: string | null
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
	const superseded = supersededVerdictIds(entries)
	const order: string[] = []
	const summaries = new Map<string, BatchSummary>()
	const reviewedItems = new Map<string, Set<string>>()

	const get = (batchId: string, ts: string): BatchSummary => {
		let summary = summaries.get(batchId)
		if (!summary) {
			summary = {
				batchId,
				purpose: null,
				itemCount: null,
				reviewed: 0,
				pending: null,
				released: null,
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
				if (record.batch && summary.purpose === null) summary.purpose = record.batch.purpose
				if (record.batch && summary.itemCount === null) summary.itemCount = record.batch.itemCount
				break
			case 'batch-complete': {
				// The release record is the authoritative manifest; it wins over the
				// denormalized copies on the item records.
				summary.released = record.ts
				if (record.purpose !== null) summary.purpose = record.purpose
				if (record.itemCount !== null) summary.itemCount = record.itemCount
				break
			}
		}
	}

	for (const summary of summaries.values()) {
		summary.reviewed = reviewedItems.get(summary.batchId)!.size
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

/** Apply a filter to resolved records, preserving append order. */
export function filterResolved(entries: Resolved[], filter: QueryFilter): Resolved[] {
	return entries.filter((entry) => {
		const record = entry.record
		if (filter.excludeRetracted && entry.retracted) return false
		if (filter.types && !filter.types.includes(record.type)) return false
		if (filter.batchIds) {
			const batchId = recordBatchId(record)
			if (!batchId || !filter.batchIds.includes(batchId)) return false
		}
		if (filter.itemIds) {
			const itemId = (record as { itemId?: string | null }).itemId ?? null
			if (!itemId || !filter.itemIds.includes(itemId)) return false
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
