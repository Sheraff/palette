/**
 * V3 verdict warehouse — library tests.
 * Run: NODE_NO_WARNINGS=1 node --experimental-strip-types --test research/v3/tests/warehouse-*.test.ts
 */

import assert from 'node:assert/strict'
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'

import {
	WAREHOUSE_SCHEMA_VERSION,
	WarehouseFormatError,
	canonicalStringify,
	hashPalette,
	newRecordId,
	validateRecord,
	type AmendmentRecord,
	type VerdictRecord,
	type WarehouseRecord,
} from '../src/warehouse/records.ts'
import {
	append,
	appendMany,
	batchSummaries,
	findOrphanAmendments,
	isBatchReleased,
	openBatches,
	readAll,
	readRecords,
	recheckFundedBy,
	resolve,
	gradesByVariant,
	preferredVariant,
	supersededVerdictIds,
} from '../src/warehouse/warehouse.ts'
import {
	counterIds,
	makeAmendment,
	makeArtwork,
	makeBatch,
	makeBatchComplete,
	makeEndorsedSample,
	makeNote,
	makeOracleLabel,
	makePalette,
	makeVerdict,
	makeVeto,
	stepClock,
} from '../src/warehouse/fixtures.ts'

const tempRoots: string[] = []
function tempFile(name = 'warehouse.jsonl'): string {
	const dir = mkdtempSync(join(tmpdir(), 'v3-warehouse-'))
	tempRoots.push(dir)
	return join(dir, 'nested', name)
}
after(() => {
	for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true })
})

function det() {
	return { now: stepClock(), idFactory: counterIds(), fsync: false }
}

describe('append / read round-trip', () => {
	it('writes one line per record and reads them back identically', () => {
		const file = tempFile()
		const options = det()
		const written = appendMany(
			file,
			[
				makeVerdict({ itemId: 'i1', comment: 'accent is too hot' }),
				makeNote({ text: 'line one\nline two', tags: ['should-be-gradient'] }),
				makeEndorsedSample(),
				makeVeto(),
				makeOracleLabel(),
				makeBatchComplete('b1'),
			],
			options,
		)

		const raw = readFileSync(file, 'utf8')
		assert.equal(raw.split('\n').filter(Boolean).length, 6, 'one line per record')
		assert.ok(!raw.slice(0, -1).includes('\n\n'), 'no blank lines')

		const read = readAll(file)
		assert.deepEqual(read, written)
		for (const record of read) {
			assert.equal(record.schema, WAREHOUSE_SCHEMA_VERSION)
			assert.match(record.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
		}
	})

	it('fills id, ts and schema when the caller omits them', () => {
		const file = tempFile()
		const record = append(file, makeVerdict(), { fsync: false })
		assert.match(record.id, /^v-[0-9a-z]{8}-[0-9a-f]{8}$/)
		assert.equal(record.schema, WAREHOUSE_SCHEMA_VERSION)
		assert.ok(Date.parse(record.ts) > 0)
	})

	it('creates the parent directory but never a file on read', () => {
		const file = tempFile()
		assert.deepEqual(readAll(file), [], 'missing file reads as empty')
		append(file, makeVerdict(), det())
		assert.equal(readAll(file).length, 1)
	})

	it('escapes embedded newlines inside the JSON line', () => {
		const file = tempFile()
		append(file, makeNote({ text: 'first\nsecond' }), det())
		const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean)
		assert.equal(lines.length, 1)
		assert.equal((readAll(file)[0] as { text: string }).text, 'first\nsecond')
	})

	it('streams the same records as readAll', async () => {
		const file = tempFile()
		appendMany(file, [makeVerdict({ itemId: 'i1' }), makeVerdict({ itemId: 'i2' }), makeNote()], det())
		const streamed: WarehouseRecord[] = []
		for await (const record of readRecords(file)) streamed.push(record)
		assert.deepEqual(streamed, readAll(file))
	})

	it('appends across separate calls without rewriting earlier lines', () => {
		const file = tempFile()
		const options = det()
		const first = append(file, makeVerdict({ itemId: 'i1' }), options)
		append(file, makeVerdict({ itemId: 'i2' }), options)
		const read = readAll(file)
		assert.equal(read.length, 2)
		assert.deepEqual(read[0], first)
	})
})

describe('validation', () => {
	it('rejects a record from an unknown schema version', () => {
		const file = tempFile()
		append(file, { ...makeVerdict(), schema: WAREHOUSE_SCHEMA_VERSION }, { ...det(), validate: false })
		// Simulate a v2-3 style record arriving in the file.
		append(file, { ...makeVerdict(), schema: 'v2-3' } as never, { ...det(), validate: false })
		assert.throws(() => readAll(file), /unknown schema version/)
	})

	it('rejects an artwork identified by anything but a full path', () => {
		assert.throws(
			() => validateRecord({ ...makeVerdict({ artwork: makeArtwork({ path: 'cover.jpg' }) }), id: 'v-1', ts: '2026-08-02T10:00:00.000Z', schema: WAREHOUSE_SCHEMA_VERSION }),
			/absolute path/,
		)
	})

	it('requires a confound note when the confound flag is set', () => {
		assert.throws(
			() => validateRecord({ ...makeVerdict({ confound: true, confoundNote: null }), id: 'v-1', ts: '2026-08-02T10:00:00.000Z', schema: WAREHOUSE_SCHEMA_VERSION }),
			/confoundNote/,
		)
	})

	it('requires both grades on a pairwise verdict and neither side B field on an absolute one', () => {
		const base = { id: 'v-1', ts: '2026-08-02T10:00:00.000Z', schema: WAREHOUSE_SCHEMA_VERSION }
		assert.throws(() => validateRecord({ ...makeVerdict({ gradeB: null as never }), ...base }), /gradeB/)
		assert.throws(
			() => validateRecord({ ...makeVerdict({ mode: 'absolute', gradeB: null, preference: null }), ...base }),
			/side B/,
		)
		// A well-formed calibration verdict passes.
		validateRecord({
			...makeVerdict({ mode: 'absolute', sideB: null, gradeB: null, preference: null }),
			...base,
		})
	})

	it('rejects a bad grade, preference and batch purpose', () => {
		const base = { id: 'v-1', ts: '2026-08-02T10:00:00.000Z', schema: WAREHOUSE_SCHEMA_VERSION }
		assert.throws(() => validateRecord({ ...makeVerdict({ gradeA: 'great' as never }), ...base }), /gradeA/)
		assert.throws(() => validateRecord({ ...makeVerdict({ preference: 'A' as never }), ...base }), /preference/)
		assert.throws(
			() => validateRecord({ ...makeVerdict({ batch: makeBatch({ purpose: 'vibes' as never }) }), ...base }),
			/batch.purpose/,
		)
	})

	it('reports the offending line number and can be told to tolerate it', () => {
		const file = tempFile()
		append(file, makeVerdict(), det())
		appendMany(file, [makeNote()], { ...det(), validate: false })
		const broken = tempFile()
		append(broken, makeVerdict(), det())
		// hand-write a malformed line
		appendFileSync(broken, 'not json\n')
		assert.throws(() => readAll(broken), /line 2/)
		const errors: string[] = []
		const ok = readAll(broken, { onError: (error) => errors.push(error.message) })
		assert.equal(ok.length, 1)
		assert.equal(errors.length, 1)
		assert.equal(readAll(file).length, 2)
	})
})

describe('hashing helpers', () => {
	it('hashes palettes by content, not key order', () => {
		const a = makePalette()
		const b = { accent: a.accent, gradient: a.gradient, foreground: a.foreground, surface: a.surface, background: a.background, surfaceCollapsed: false, accentCollapsed: false }
		assert.equal(hashPalette(a), hashPalette(b as never))
		assert.notEqual(hashPalette(a), hashPalette(makePalette({ accent: '#000000' })))
		assert.equal(canonicalStringify({ b: 1, a: 2 }), '{"a":2,"b":1}')
	})

	it('generates sortable, type-prefixed ids', () => {
		const early = newRecordId('verdict', 1_000_000)
		const late = newRecordId('verdict', 2_000_000)
		assert.ok(early < late)
		assert.ok(newRecordId('amendment', 1).startsWith('am-'))
	})
})

describe('amendment resolution', () => {
	it('applies a single amendment, latest wins', () => {
		const file = tempFile()
		const options = det()
		const verdict = append(file, makeVerdict({ gradeA: 'strong', comment: 'good' }), options)
		append(file, makeAmendment(verdict.id, { gradeA: 'acceptable', comment: 'on second look, muddy' }), options)

		const resolved = resolve(readAll(file))
		assert.equal(resolved.length, 1, 'amendment records are not returned as records')
		const entry = resolved[0]!
		assert.equal((entry.record as VerdictRecord).gradeA, 'acceptable')
		assert.equal((entry.record as VerdictRecord).comment, 'on second look, muddy')
		assert.equal((entry.original as VerdictRecord).gradeA, 'strong', 'the original is preserved')
		assert.equal(entry.amendments.length, 1)
		assert.deepEqual(entry.changedFields, ['gradeA', 'comment'])
		assert.equal(entry.retracted, false)
	})

	it('applies chained amendments in order, whether they target the original or the previous amendment', () => {
		const file = tempFile()
		const options = det()
		const verdict = append(file, makeVerdict({ gradeA: 'strong', gradeB: 'weak', preference: 'a' }), options)
		const first = append(file, makeAmendment(verdict.id, { gradeB: 'acceptable' }), options)
		// second amendment targets the first amendment, not the verdict
		append(file, makeAmendment(first.id, { gradeB: 'strong', preference: 'no-preference' }), options)

		const entry = resolve(readAll(file))[0]!
		const record = entry.record as VerdictRecord
		assert.equal(record.gradeA, 'strong', 'untouched field survives')
		assert.equal(record.gradeB, 'strong', 'last write wins on a twice-amended field')
		assert.equal(record.preference, 'no-preference')
		assert.equal(entry.amendments.length, 2)
		assert.deepEqual(
			entry.amendments.map((a) => a.id),
			['am-2', 'am-3'],
		)
		assert.equal(entry.lastAmendedAt, entry.amendments[1]!.ts)
	})

	it('orders amendments by timestamp even when appended out of order', () => {
		const file = tempFile()
		const options = { ...det(), validate: true }
		const verdict = append(file, makeVerdict({ gradeA: 'strong' }), options)
		append(file, { ...makeAmendment(verdict.id, { gradeA: 'weak' }), ts: '2026-08-02T20:00:00.000Z' }, options)
		append(file, { ...makeAmendment(verdict.id, { gradeA: 'acceptable' }), ts: '2026-08-02T15:00:00.000Z' }, options)

		const record = resolve(readAll(file))[0]!.record as VerdictRecord
		assert.equal(record.gradeA, 'weak', 'the later timestamp wins regardless of append order')
	})

	it('flags retraction and keeps the record visible', () => {
		const file = tempFile()
		const options = det()
		const verdict = append(file, makeVerdict(), options)
		append(file, makeAmendment(verdict.id, {}, { retract: true, reason: 'wrong artwork shown' }), options)

		const all = resolve(readAll(file))
		assert.equal(all.length, 1)
		assert.equal(all[0]!.retracted, true)
		assert.equal(resolve(readAll(file), { includeRetracted: false }).length, 0)
	})

	it('refuses a patch that would change what the record was about', () => {
		const file = tempFile()
		const options = det()
		const verdict = append(file, makeVerdict(), options)
		assert.throws(
			() => append(file, makeAmendment(verdict.id, { artwork: makeArtwork({ name: 'other.jpg' }) }), options),
			/not amendable/,
		)
		assert.throws(() => append(file, makeAmendment(verdict.id, { sideA: null }), options), /not amendable/)
		assert.throws(() => append(file, makeAmendment(verdict.id, { batch: makeBatch() }), options), /not amendable/)
		assert.equal(readAll(file).length, 1, 'nothing was written')
	})

	it('treats an endorsement as immutable evidence: comment amendable, palette not', () => {
		const file = tempFile()
		const options = det()
		const endorsement = append(file, makeEndorsedSample({ comment: 'this is the palette I wanted' }), options)

		// A changed palette is a new endorsement, not an amendment.
		assert.throws(
			() => append(file, makeAmendment(endorsement.id, { palette: makePalette({ accent: '#000000' }) }), options),
			/not amendable/,
		)
		assert.throws(() => append(file, makeAmendment(endorsement.id, { paletteHash: 'x' }), options), /not amendable/)
		assert.equal(readAll(file).length, 1, 'nothing was written')

		// The comment is amendable, and a mistaken endorsement is withdrawn by retraction.
		append(file, makeAmendment(endorsement.id, { comment: 'the accent should be warmer than this' }), options)
		const amended = resolve(readAll(file))[0]!
		assert.equal((amended.record as { comment: string }).comment, 'the accent should be warmer than this')
		assert.deepEqual((amended.record as { palette: { accent: string } }).palette.accent, makePalette().accent)

		append(file, makeAmendment(endorsement.id, {}, { retract: true, reason: 'composed against the wrong artwork' }), options)
		assert.equal(resolve(readAll(file))[0]!.retracted, true)
	})

	it('refuses an amendment whose target does not exist', () => {
		const file = tempFile()
		append(file, makeVerdict(), det())
		assert.throws(() => append(file, makeAmendment('v-nope', { comment: 'x' }), det()), WarehouseFormatError)
	})

	it('reports orphan amendments rather than applying them', () => {
		const file = tempFile()
		const options = det()
		append(file, makeVerdict(), options)
		append(file, makeAmendment('v-missing', { comment: 'x' }), { ...options, verifyAmendmentTarget: false })
		const records = readAll(file)
		assert.equal(resolve(records).length, 1)
		assert.deepEqual(
			findOrphanAmendments(records).map((a: AmendmentRecord) => a.targetId),
			['v-missing'],
		)
	})

	it('amends a note and an oracle label too', () => {
		const file = tempFile()
		const options = det()
		const note = append(file, makeNote({ text: 'raw', tags: [] }), options)
		append(file, makeAmendment(note.id, { text: 'raw, clarified', tags: ['alien-color'] }), options)
		const label = append(file, makeOracleLabel({ answer: 'flat_field' }), options)
		append(file, makeAmendment(label.id, { answer: 'shaded_field' }, { reason: 'mis-key' }), options)

		const resolved = resolve(readAll(file))
		assert.equal((resolved[0]!.record as { text: string }).text, 'raw, clarified')
		assert.deepEqual((resolved[0]!.record as { tags: string[] }).tags, ['alien-color'])
		assert.equal((resolved[1]!.record as { answer: string }).answer, 'shaded_field')
	})
})

describe('batch status and completion', () => {
	it('detects release and counts pending / reviewed', () => {
		const file = tempFile()
		const options = det()
		const batch = makeBatch({ id: 'b1', itemCount: 4, purpose: 'arm' })
		appendMany(
			file,
			[
				makeVerdict({ batch, itemId: 'i1' }),
				makeVerdict({ batch, itemId: 'i2' }),
				makeNote({ batch, text: 'the accent reads as alien on both' , tags: ['alien-color'] }),
			],
			options,
		)

		let summaries = batchSummaries(readAll(file))
		assert.equal(summaries.length, 1)
		assert.deepEqual(
			{ id: summaries[0]!.batchId, reviewed: summaries[0]!.reviewed, pending: summaries[0]!.pending, released: summaries[0]!.released },
			{ id: 'b1', reviewed: 2, pending: 2, released: null },
		)
		assert.equal(summaries[0]!.notes, 1)
		assert.equal(isBatchReleased(readAll(file), 'b1'), false)
		assert.deepEqual(openBatches(readAll(file)), ['b1'])

		appendMany(file, [makeVerdict({ batch, itemId: 'i3' }), makeVerdict({ batch, itemId: 'i4' })], options)
		append(file, makeBatchComplete('b1', { itemCount: 4, releasedItemIds: ['i1', 'i2', 'i3', 'i4'] }), options)

		summaries = batchSummaries(readAll(file))
		assert.equal(summaries[0]!.reviewed, 4)
		assert.equal(summaries[0]!.pending, 0)
		assert.ok(summaries[0]!.released, 'released carries the batch-complete timestamp')
		assert.equal(isBatchReleased(readAll(file), 'b1'), true)
		assert.deepEqual(openBatches(readAll(file)), [])
	})

	it('does not double-count an item reviewed twice, and drops retracted verdicts from the count', () => {
		const file = tempFile()
		const options = det()
		const batch = makeBatch({ id: 'b2', itemCount: 3 })
		append(file, makeVerdict({ batch, itemId: 'i1' }), options)
		const second = append(file, makeVerdict({ batch, itemId: 'i1', gradeA: 'weak' }), options)
		const third = append(file, makeVerdict({ batch, itemId: 'i2' }), options)
		append(file, makeAmendment(third.id, {}, { retract: true, reason: 'shown the wrong rendition' }), options)

		const summary = batchSummaries(readAll(file))[0]!
		assert.equal(summary.verdicts, 3)
		assert.equal(summary.reviewed, 1, 'i1 counted once, i2 retracted')
		assert.equal(summary.pending, 2)
		assert.equal(summary.retracted, 1)
		assert.ok(second.id)
	})

	it('groups batch-less records under the placeholder batch', () => {
		const file = tempFile()
		const options = det()
		append(file, makeVeto(), options)
		append(file, makeOracleLabel(), options)
		const summaries = batchSummaries(readAll(file))
		assert.deepEqual(summaries.map((s) => s.batchId), ['-'])
		assert.equal(summaries[0]!.vetoes, 1)
		assert.equal(summaries[0]!.labels, 1)
	})

	it('lets the release record correct a denormalized item count', () => {
		const file = tempFile()
		const options = det()
		const batch = makeBatch({ id: 'b3', itemCount: 6 })
		append(file, makeVerdict({ batch, itemId: 'i1' }), options)
		append(file, makeBatchComplete('b3', { itemCount: 2 }), options)
		const summary = batchSummaries(readAll(file))[0]!
		assert.equal(summary.itemCount, 2, 'the release manifest wins over the push-time copy')
		assert.equal(summary.pending, 1)
	})
})

describe('pre-release re-grades', () => {
	it('marks earlier verdicts on the same item as superseded without deleting them', () => {
		const file = tempFile()
		const options = det()
		const batch = makeBatch({ id: 'b1', itemCount: 2 })
		const draft = append(file, makeVerdict({ batch, itemId: 'i1', gradeA: 'strong' }), options)
		const final = append(file, makeVerdict({ batch, itemId: 'i1', gradeA: 'acceptable' }), options)
		const other = append(file, makeVerdict({ batch, itemId: 'i2' }), options)

		const entries = resolve(readAll(file))
		const superseded = supersededVerdictIds(entries)
		assert.deepEqual([...superseded], [draft.id])
		assert.ok(!superseded.has(final.id))
		assert.ok(!superseded.has(other.id))
		assert.equal(entries.length, 3, 'drafts stay in the log')
	})

	it('keeps a different item and a different batch separate', () => {
		const file = tempFile()
		const options = det()
		append(file, makeVerdict({ batch: makeBatch({ id: 'b1' }), itemId: 'i1' }), options)
		append(file, makeVerdict({ batch: makeBatch({ id: 'b2' }), itemId: 'i1' }), options)
		assert.equal(supersededVerdictIds(resolve(readAll(file))).size, 0)
	})

	it('reads grades and preference by variant without the blinding key', () => {
		const file = tempFile()
		const verdict = append(file, makeVerdict({ gradeA: 'strong', gradeB: 'weak', preference: 'a' }), det())
		assert.deepEqual(gradesByVariant(verdict), { trunk: 'strong', 'arm/foo': 'weak' })
		assert.equal(preferredVariant(verdict), 'trunk')
		assert.equal(preferredVariant({ ...verdict, preference: 'no-preference' }), null)
	})
})

describe('funded-by re-check', () => {
	function setup() {
		const file = tempFile()
		const options = det()
		const v1 = append(file, makeVerdict({ itemId: 'i1', gradeA: 'strong' }), options)
		const v2 = append(file, makeVerdict({ itemId: 'i2', gradeA: 'strong' }), options)
		const v3 = append(file, makeVerdict({ itemId: 'i3', gradeA: 'weak' }), options)
		return { file, options, v1, v2, v3 }
	}

	it('flags a decision funded by a verdict amended after the decision', () => {
		const { file, options, v1, v2 } = setup()
		const decisionTs = '2026-08-02T12:00:00.000Z'
		append(file, { ...makeAmendment(v1.id, { gradeA: 'weak' }), ts: '2026-08-02T13:00:00.000Z' }, options)

		const hits = recheckFundedBy(
			[{ id: 'integration-7', ts: decisionTs, kind: 'integration', fundedBy: [v1.id, v2.id] }],
			readAll(file),
		)
		assert.equal(hits.length, 1)
		assert.equal(hits[0]!.decisionId, 'integration-7')
		assert.deepEqual(hits[0]!.stale.map((s) => s.recordId), [v1.id])
		assert.deepEqual(hits[0]!.stale[0]!.changedFields, ['gradeA'])
		assert.equal(hits[0]!.stale[0]!.retracted, false)
		assert.deepEqual(hits[0]!.missing, [])
	})

	it('does not flag a decision made after the amendment', () => {
		const { file, options, v1 } = setup()
		append(file, { ...makeAmendment(v1.id, { gradeA: 'weak' }), ts: '2026-08-02T13:00:00.000Z' }, options)
		const hits = recheckFundedBy(
			[{ id: 'later', ts: '2026-08-02T14:00:00.000Z', fundedBy: [v1.id] }],
			readAll(file),
		)
		assert.deepEqual(hits, [])
	})

	it('flags every amendment when the decision has no timestamp', () => {
		const { file, options, v1 } = setup()
		append(file, makeAmendment(v1.id, { comment: 'clarified' }), options)
		const hits = recheckFundedBy([{ id: 'undated', fundedBy: [v1.id] }], readAll(file))
		assert.equal(hits.length, 1)
		assert.equal(hits[0]!.decisionTs, null)
	})

	it('marks retraction and missing evidence', () => {
		const { file, options, v3 } = setup()
		append(file, makeAmendment(v3.id, {}, { retract: true, reason: 'duplicate item' }), options)
		const hits = recheckFundedBy(
			[{ id: 'd1', kind: 'adjudication', fundedBy: [v3.id, 'v-gone'] }],
			readAll(file),
		)
		assert.equal(hits.length, 1)
		assert.equal(hits[0]!.stale[0]!.retracted, true)
		assert.deepEqual(hits[0]!.missing, ['v-gone'])
	})

	it('returns nothing when no funding evidence moved', () => {
		const { file, v1, v2 } = setup()
		assert.deepEqual(recheckFundedBy([{ id: 'clean', fundedBy: [v1.id, v2.id] }], readAll(file)), [])
	})

	it('collects several amendments on one verdict into one hit', () => {
		const { file, options, v1 } = setup()
		append(file, makeAmendment(v1.id, { gradeA: 'acceptable' }), options)
		append(file, makeAmendment(v1.id, { comment: 'and the accent is wrong' }), options)
		const hits = recheckFundedBy([{ id: 'd', fundedBy: [v1.id] }], readAll(file))
		assert.equal(hits[0]!.stale.length, 1)
		assert.equal(hits[0]!.stale[0]!.amendmentIds.length, 2)
		assert.deepEqual(hits[0]!.stale[0]!.changedFields, ['gradeA', 'comment'])
	})
})
