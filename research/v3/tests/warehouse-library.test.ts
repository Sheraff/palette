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
	addressableItemIds,
	append,
	appendMany,
	batchSummaries,
	filterResolved,
	findInvalidAmendments,
	findOrphanAmendments,
	isBatchReleased,
	openBatches,
	readAll,
	readRecords,
	recheckFundedBy,
	releasedItemIndex,
	resolve,
	gradesByVariant,
	preferredVariant,
	supersededOracleLabelIds,
	supersededVerdictIds,
} from '../src/warehouse/warehouse.ts'
import {
	counterIds,
	makeAmendment,
	makeArtwork,
	makeBatch,
	makeBatchComplete,
	makeEndorsedSample,
	makeFingerprint,
	makeNote,
	makeOracleLabel,
	makePalette,
	makeSide,
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

	it('counts a vetoed item as judged, and pending again once the veto is retracted', () => {
		const file = tempFile()
		const options = det()
		const batch = makeBatch({ id: 'b4', itemCount: 3 })
		append(file, makeVerdict({ batch, itemId: 'i1' }), options)

		let summary = batchSummaries(readAll(file))[0]!
		assert.equal(summary.reviewed, 1)
		assert.equal(summary.pending, 2)

		// The reviewer rules i2 out of the corpus instead of grading it.
		const veto = append(file, makeVeto({ batch, itemId: 'i2', reason: 'disc scan, not artwork' }), options)
		summary = batchSummaries(readAll(file))[0]!
		assert.equal(summary.reviewed, 2, 'a vetoed item is judged, not skipped')
		assert.equal(summary.pending, 1)
		assert.equal(summary.vetoes, 1)

		// Withdrawing the veto puts the item back in the queue.
		append(file, makeAmendment(veto.id, {}, { retract: true, reason: 'it is artwork after all' }), options)
		summary = batchSummaries(readAll(file))[0]!
		assert.equal(summary.reviewed, 1, 'a retracted veto judges nothing')
		assert.equal(summary.pending, 2)
	})

	it('does not let a veto double-count an item that also has a verdict', () => {
		const file = tempFile()
		const options = det()
		const batch = makeBatch({ id: 'b5', itemCount: 2 })
		append(file, makeVerdict({ batch, itemId: 'i1' }), options)
		append(file, makeVeto({ batch, itemId: 'i1', reason: 'on reflection, out of corpus' }), options)
		const summary = batchSummaries(readAll(file))[0]!
		assert.equal(summary.reviewed, 1)
		assert.equal(summary.pending, 1)
	})

	it('ignores a veto that names no item when counting pending', () => {
		const file = tempFile()
		const options = det()
		const batch = makeBatch({ id: 'b6', itemCount: 2 })
		append(file, makeVerdict({ batch, itemId: 'i1' }), options)
		append(file, makeVeto({ batch, itemId: null, reason: 'corpus-level note' }), options)
		const summary = batchSummaries(readAll(file))[0]!
		assert.equal(summary.reviewed, 1)
		assert.equal(summary.pending, 1)
		assert.equal(summary.vetoes, 1)
	})

	it('does not count a superseded pre-release draft as a second reviewed item', () => {
		const file = tempFile()
		const options = det()
		const batch = makeBatch({ id: 'b7', itemCount: 2 })
		append(file, makeVerdict({ batch, itemId: 'i1', gradeA: 'strong' }), options)
		append(file, makeVerdict({ batch, itemId: 'i1', gradeA: 'weak' }), options)
		const summary = batchSummaries(readAll(file))[0]!
		assert.equal(summary.reviewed, 1)
		assert.equal(summary.pending, 1)
	})

	it('leaves the earlier draft standing when its replacement is retracted', () => {
		// A retracted record is never the position and never supersedes anything, so the
		// reviewer's remaining un-retracted opinion still counts. Matches the review
		// server, whose #verdicts map keeps the previous state when the latest retracts.
		const file = tempFile()
		const options = det()
		const batch = makeBatch({ id: 'b8', itemCount: 2 })
		append(file, makeVerdict({ batch, itemId: 'i1', gradeA: 'strong' }), options)
		const replacement = append(file, makeVerdict({ batch, itemId: 'i1', gradeA: 'weak' }), options)
		append(file, makeAmendment(replacement.id, {}, { retract: true, reason: 'wrong rendition shown' }), options)

		const summary = batchSummaries(readAll(file))[0]!
		assert.equal(summary.reviewed, 1, 'the draft is the standing position again')
		assert.equal(summary.pending, 1)
		assert.equal(supersededVerdictIds(resolve(readAll(file))).size, 0, 'a retracted record supersedes nothing')
	})

	it('counts a labelled item as judged so a fully answered oracle round can release', () => {
		const file = tempFile()
		const options = det()
		const batch = makeBatch({ id: 'ob1', purpose: 'oracle-validation', itemCount: 3 })
		append(file, makeOracleLabel({ batch, imageId: 'pair-1', questionKey: 'same_color', answer: true }), options)
		append(file, makeOracleLabel({ batch, imageId: 'pair-2', questionKey: 'same_color', answer: false }), options)

		const summary = batchSummaries(readAll(file))[0]!
		assert.equal(summary.labels, 2)
		assert.equal(summary.reviewed, 2, 'labels are a judging channel, not a side note')
		assert.equal(summary.pending, 1)
		assert.equal(summary.verdicts, 0)
	})

	it('counts an undone-and-re-answered item once, not twice', () => {
		const file = tempFile()
		const options = det()
		const batch = makeBatch({ id: 'ob2', purpose: 'oracle-validation', itemCount: 2 })
		const first = append(file, makeOracleLabel({ batch, imageId: 'pair-1', questionKey: 'same_color', answer: true }), options)
		const second = append(file, makeOracleLabel({ batch, imageId: 'pair-1', questionKey: 'same_color', answer: false }), options)

		const entries = resolve(readAll(file))
		assert.deepEqual([...supersededOracleLabelIds(entries)], [first.id], 'the undone answer is superseded')
		assert.ok(!supersededOracleLabelIds(entries).has(second.id))

		const summary = batchSummaries(readAll(file))[0]!
		assert.equal(summary.labels, 2, 'both records stay in the log')
		assert.equal(summary.reviewed, 1, 'one item, answered once')
		assert.equal(summary.pending, 1)
	})

	it('keeps labels for different questions and different items apart', () => {
		const file = tempFile()
		const options = det()
		const batch = makeBatch({ id: 'ob3', purpose: 'oracle-validation', itemCount: 4 })
		append(file, makeOracleLabel({ batch, imageId: 'img-1', questionKey: 'has_text', answer: true }), options)
		append(file, makeOracleLabel({ batch, imageId: 'img-1', questionKey: 'ground_type', answer: 'flat_field' }), options)
		append(file, makeOracleLabel({ batch, imageId: 'img-2', questionKey: 'has_text', answer: false }), options)

		assert.equal(supersededOracleLabelIds(resolve(readAll(file))).size, 0, 'different questions never supersede')
		const summary = batchSummaries(readAll(file))[0]!
		// The round asks two questions, so one item is one (image, question) answer —
		// which is how the batch counted its 4 items and how its release manifest names
		// them. Counting distinct images here is what reported answered rounds as
		// permanently pending (adversarial review F1).
		assert.equal(summary.labelUnit, 'image-question')
		assert.equal(summary.reviewed, 3, 'three of the four question-image pairs are answered')
		assert.equal(summary.pending, 1)
	})

	it('puts a labelled item back in the queue when the answer is retracted', () => {
		const file = tempFile()
		const options = det()
		const batch = makeBatch({ id: 'ob4', purpose: 'oracle-validation', itemCount: 2 })
		const label = append(file, makeOracleLabel({ batch, imageId: 'pair-1', questionKey: 'same_color', answer: true }), options)
		append(file, makeAmendment(label.id, {}, { retract: true, reason: 'mis-keyed' }), options)

		const summary = batchSummaries(readAll(file))[0]!
		assert.equal(summary.reviewed, 0)
		assert.equal(summary.pending, 2)
	})

	it('counts verdicts, vetoes and labels together in a mixed batch', () => {
		const file = tempFile()
		const options = det()
		const batch = makeBatch({ id: 'mix1', purpose: 'mechanism', itemCount: 4 })
		append(file, makeVerdict({ batch, itemId: 'i1' }), options)
		append(file, makeVeto({ batch, itemId: 'i2', reason: 'disc scan' }), options)
		append(file, makeOracleLabel({ batch, imageId: 'i3', questionKey: 'has_text', answer: true }), options)

		const summary = batchSummaries(readAll(file))[0]!
		assert.equal(summary.verdicts, 1)
		assert.equal(summary.vetoes, 1)
		assert.equal(summary.labels, 1)
		assert.equal(summary.reviewed, 3, 'every judging channel counts toward release')
		assert.equal(summary.pending, 1)
	})

	it('does not double-count an item that carries both a verdict and a label', () => {
		const file = tempFile()
		const options = det()
		const batch = makeBatch({ id: 'mix2', itemCount: 2 })
		append(file, makeVerdict({ batch, itemId: 'i1' }), options)
		append(file, makeOracleLabel({ batch, imageId: 'i1', questionKey: 'has_text', answer: true }), options)
		const summary = batchSummaries(readAll(file))[0]!
		assert.equal(summary.reviewed, 1)
		assert.equal(summary.pending, 1)
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

/**
 * A per-question oracle round, in the shape the live warehouse actually uses:
 * `itemCount` is images × questions, and the release manifest names one item per
 * (question, image) as `<prefix>-<questionKey>-<sha256[0:12]>`.
 * Adversarial review F1/F7.
 */
const PER_QUESTION_IMAGES = [
	makeArtwork({ path: '/corpus/music-artworks/one.jpg', sha256: 'a'.repeat(64) }),
	makeArtwork({ path: '/corpus/music-artworks/two.jpg', sha256: 'b'.repeat(64) }),
]
const PER_QUESTION_KEYS = ['bg_visible', 'has_text', 'grain_or_noise']

function perQuestionRound(options: { answered?: number; release?: boolean } = {}) {
	const file = tempFile()
	const det_ = det()
	const batch = makeBatch({
		id: 'pq1',
		purpose: 'oracle-validation',
		itemCount: PER_QUESTION_IMAGES.length * PER_QUESTION_KEYS.length,
		fundedBy: [],
	})
	const itemIds: string[] = []
	const pairs: Array<{ artwork: (typeof PER_QUESTION_IMAGES)[number]; questionKey: string }> = []
	for (const questionKey of PER_QUESTION_KEYS)
		for (const artwork of PER_QUESTION_IMAGES) {
			itemIds.push(`pq-${questionKey}-${artwork.sha256.slice(0, 12)}`)
			pairs.push({ artwork, questionKey })
		}

	const answered = options.answered ?? pairs.length
	const written = pairs.slice(0, answered).map(({ artwork, questionKey }) =>
		append(
			file,
			makeOracleLabel({ batch, imageId: artwork.path, artwork, questionKey, answer: 'yes' }),
			det_,
		),
	)
	if (options.release !== false)
		append(file, makeBatchComplete('pq1', { purpose: 'oracle-validation', itemCount: batch.itemCount, releasedItemIds: itemIds }), det_)
	return { file, batch, itemIds, written, options: det_ }
}

describe('per-question oracle rounds (F1)', () => {
	it('reports a fully answered released round as pending=0, not one item per image', () => {
		const { file } = perQuestionRound()
		const summary = batchSummaries(readAll(file))[0]!
		assert.equal(summary.itemCount, 6, 'itemCount is images × questions')
		assert.equal(summary.labels, 6)
		assert.equal(summary.labelUnit, 'image-question')
		assert.equal(summary.reviewed, 6, 'every (image, question) answer is one reviewed item')
		assert.equal(summary.pending, 0, 'a finished, released round has nothing outstanding')
		assert.equal(summary.releasedItemCount, 6)
	})

	it('counts only the answers actually given while the round is still open', () => {
		const { file } = perQuestionRound({ answered: 4, release: false })
		const summary = batchSummaries(readAll(file))[0]!
		assert.equal(summary.reviewed, 4)
		assert.equal(summary.pending, 2, 'genuinely outstanding answers are still reported')
	})

	it('does not count a re-answer twice', () => {
		const { file, batch, options } = perQuestionRound()
		append(
			file,
			makeOracleLabel({
				batch,
				imageId: PER_QUESTION_IMAGES[0]!.path,
				artwork: PER_QUESTION_IMAGES[0],
				questionKey: 'has_text',
				answer: 'no',
			}),
			options,
		)
		const summary = batchSummaries(readAll(file))[0]!
		assert.equal(summary.labels, 7, 'the undone answer stays in the log')
		assert.equal(summary.reviewed, 6)
		assert.equal(summary.pending, 0)
	})

	it('keeps the image as the item when the round asks a single question', () => {
		const file = tempFile()
		const options = det()
		const batch = makeBatch({ id: 'one-q', purpose: 'oracle-validation', itemCount: 2 })
		append(file, makeOracleLabel({ batch, imageId: 'img-1', questionKey: 'same_color', answer: true }), options)
		append(file, makeOracleLabel({ batch, imageId: 'img-2', questionKey: 'same_color', answer: false }), options)
		const summary = batchSummaries(readAll(file))[0]!
		assert.equal(summary.labelUnit, 'image')
		assert.equal(summary.reviewed, 2)
		assert.equal(summary.pending, 0)
	})
})

describe('item ids published by the release manifest (F7)', () => {
	it('addresses an oracle label by the per-question item id the batch released', () => {
		const { file, itemIds } = perQuestionRound()
		const records = readAll(file)
		const released = releasedItemIndex(records)
		const wanted = `pq-has_text-${'a'.repeat(12)}`
		assert.ok(itemIds.includes(wanted))

		const matched = filterResolved(resolve(records), { itemIds: [wanted] }, released)
		assert.equal(matched.length, 1, 'an id the batch released by name resolves to its answer')
		const record = matched[0]!.record as { questionKey: string; imageId: string }
		assert.equal(record.questionKey, 'has_text')
		assert.equal(record.imageId, PER_QUESTION_IMAGES[0]!.path)
	})

	it('does not let one question of an image answer for another', () => {
		const { file } = perQuestionRound()
		const records = readAll(file)
		const released = releasedItemIndex(records)
		for (const questionKey of PER_QUESTION_KEYS) {
			const matched = filterResolved(resolve(records), { itemIds: [`pq-${questionKey}-${'a'.repeat(12)}`] }, released)
			assert.equal(matched.length, 1)
			assert.equal((matched[0]!.record as { questionKey: string }).questionKey, questionKey)
		}
	})

	it('addresses a one-question round by its image-only released id', () => {
		const file = tempFile()
		const options = det()
		const artwork = makeArtwork({ path: '/corpus/music-artworks/one.jpg', sha256: 'c'.repeat(64) })
		const batch = makeBatch({ id: 'gt1', purpose: 'oracle-validation', itemCount: 1 })
		append(file, makeOracleLabel({ batch, imageId: artwork.path, artwork, questionKey: 'ground_type', answer: 'flat_field' }), options)
		append(file, makeBatchComplete('gt1', { itemCount: 1, releasedItemIds: [`gt-${'c'.repeat(12)}`] }), options)

		const records = readAll(file)
		const matched = filterResolved(resolve(records), { itemIds: [`gt-${'c'.repeat(12)}`] }, releasedItemIndex(records))
		assert.equal(matched.length, 1)
	})

	it('keeps a record addressable by its own itemId when it has one', () => {
		const file = tempFile()
		append(file, makeVerdict({ itemId: 'i1' }), det())
		const records = readAll(file)
		assert.deepEqual(addressableItemIds(records[0]!, releasedItemIndex(records)), ['i1'])
	})
})

describe('amendment allowlist at query time (F2)', () => {
	/** The escape hatch documented on `append`: a bulk replay that skips target verification. */
	const unchecked = (options: ReturnType<typeof det>) => ({ ...options, verifyAmendmentTarget: false })

	function forged() {
		const file = tempFile()
		const options = det()
		const verdict = append(file, makeVerdict({ itemId: 'i1', gradeA: 'strong', comment: 'as shown' }), options)
		const amendment = append(
			file,
			makeAmendment(
				verdict.id,
				{
					artwork: makeArtwork({ path: '/tmp/OTHER.jpg', sha256: 'f'.repeat(64) }),
					itemId: 'i-FORGED',
					sideA: { paletteHash: 'FORGED', fingerprint: { algorithmVersion: 'x', preprocessingVersion: 'x', gitCommit: 'x', dirty: false }, variantId: 'A' },
				},
				{ reason: 'forge identity' },
			),
			unchecked(options),
		)
		return { file, verdict, amendment }
	}

	it('refuses to apply a patch that rewrites identity, item or palette hash', () => {
		const { file, verdict } = forged()
		const entry = resolve(readAll(file))[0]!
		const record = entry.record as VerdictRecord

		assert.equal(record.artwork.path, verdict.artwork.path, 'the artwork the reviewer saw is unchanged')
		assert.equal(record.artwork.sha256, verdict.artwork.sha256)
		assert.equal(record.itemId, 'i1')
		assert.equal(record.sideA.paletteHash, verdict.sideA.paletteHash, 'the palette hash is frozen at append time')
		assert.deepEqual(entry.changedFields, [], 'nothing was applied')
	})

	it('names the refusal instead of failing silently', () => {
		const { file, verdict, amendment } = forged()
		const entry = resolve(readAll(file))[0]!
		assert.equal(entry.integrityErrors.length, 1)
		assert.deepEqual(entry.integrityErrors[0]!.rejectedFields, ['artwork', 'itemId', 'sideA'])
		assert.equal(entry.integrityErrors[0]!.amendmentId, amendment.id)
		assert.equal(entry.integrityErrors[0]!.rootId, verdict.id)
		assert.equal(entry.integrityErrors[0]!.targetType, 'verdict')

		const found = findInvalidAmendments(readAll(file))
		assert.equal(found.length, 1)
		assert.equal(found[0]!.amendmentId, amendment.id)
		assert.match(found[0]!.reason, /not amendable on a verdict record/)
	})

	it('still applies the amendable half of a mixed patch', () => {
		const file = tempFile()
		const options = det()
		const verdict = append(file, makeVerdict({ gradeA: 'strong' }), options)
		append(
			file,
			makeAmendment(verdict.id, { gradeA: 'weak', paletteHash: 'FORGED', itemId: 'i-FORGED' }),
			unchecked(options),
		)
		const entry = resolve(readAll(file))[0]!
		assert.equal((entry.record as VerdictRecord).gradeA, 'weak', 'the judgment is a second thought and stands')
		assert.equal((entry.record as VerdictRecord).itemId, 'i1', 'what the record was about does not move')
		assert.equal((entry.record as { paletteHash?: string }).paletteHash, undefined)
		assert.deepEqual(entry.changedFields, ['gradeA'])
		assert.deepEqual(entry.integrityErrors[0]!.rejectedFields, ['paletteHash', 'itemId'])
	})

	it('applies a retraction whose patch was refused, because retract is not a patch field', () => {
		const file = tempFile()
		const options = det()
		const verdict = append(file, makeVerdict(), options)
		append(
			file,
			makeAmendment(verdict.id, { itemId: 'i-FORGED' }, { retract: true, reason: 'withdrawn' }),
			unchecked(options),
		)
		const entry = resolve(readAll(file))[0]!
		assert.equal(entry.retracted, true)
		assert.equal((entry.record as VerdictRecord).itemId, 'i1')
		assert.equal(entry.integrityErrors.length, 1)
	})

	it('reports nothing on a clean log', () => {
		const file = tempFile()
		const options = det()
		const verdict = append(file, makeVerdict(), options)
		append(file, makeAmendment(verdict.id, { gradeA: 'weak' }), options)
		assert.deepEqual(findInvalidAmendments(readAll(file)), [])
		assert.deepEqual(resolve(readAll(file))[0]!.integrityErrors, [])
	})
})

describe('demo fixture records (F6)', () => {
	it('marks a batch whose verdicts carry a demo fingerprint', () => {
		const file = tempFile()
		const options = det()
		const batch = makeBatch({ id: 'demo-batch-0001', purpose: 'mechanism', itemCount: 1 })
		append(
			file,
			makeVerdict({
				batch,
				itemId: 'demo-1',
				sideA: makeSide('trunk', { fingerprint: makeFingerprint({ algorithmVersion: 'demo-fixture-alpha' }) }),
				sideB: makeSide('arm/foo', { fingerprint: makeFingerprint({ algorithmVersion: 'demo-fixture-bravo' }) }),
			}),
			options,
		)
		append(file, makeVerdict({ batch: makeBatch({ id: 'real', itemCount: 1 }), itemId: 'r1' }), options)
		const summaries = batchSummaries(readAll(file))
		assert.equal(summaries.find((s) => s.batchId === 'demo-batch-0001')!.demo, true)
		assert.equal(summaries.find((s) => s.batchId === 'real')!.demo, false)
	})

	it('does not call a record a fixture on a placeholder commit alone', () => {
		// `fixtures.ts` and any pre-commit import stamp 0×40. Excluding a record from the
		// ground-truth count on that evidence would hide real reviewer work.
		const file = tempFile()
		append(file, makeVerdict({ batch: makeBatch({ id: 'real2' }), itemId: 'r1' }), det())
		const summary = batchSummaries(readAll(file))[0]!
		assert.equal(summary.demo, false)
		assert.equal(summary.placeholderCommits, 1, 'it is reported, not hidden')
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

	describe('evidence the reviewer replaced (F3)', () => {
		it('flags a decision funded by a verdict the reviewer re-graded', () => {
			// Re-answering is the channel the reviewer actually uses; amending is not.
			const file = tempFile()
			const options = det()
			const batch = makeBatch({ id: 'b1', itemCount: 1 })
			const draft = append(file, makeVerdict({ batch, itemId: 'i1', gradeA: 'strong' }), options)
			const standing = append(file, makeVerdict({ batch, itemId: 'i1', gradeA: 'weak' }), options)

			const hits = recheckFundedBy([{ id: 'd', ts: '2026-08-02T23:00:00.000Z', fundedBy: [draft.id] }], readAll(file))
			assert.equal(hits.length, 1, 'a decision resting on a replaced draft is not current')
			assert.equal(hits[0]!.superseded.length, 1)
			assert.equal(hits[0]!.superseded[0]!.recordId, draft.id)
			assert.equal(hits[0]!.superseded[0]!.replacedById, standing.id, 'the gate says what stands instead')
			assert.equal(hits[0]!.superseded[0]!.replacedAt, standing.ts)
			assert.deepEqual(hits[0]!.stale, [], 'nothing was amended')
		})

		it('flags a decision funded by an oracle answer the reviewer re-answered', () => {
			const file = tempFile()
			const options = det()
			const batch = makeBatch({ id: 'ob1', purpose: 'oracle-validation', itemCount: 1 })
			const first = append(file, makeOracleLabel({ batch, imageId: 'img-1', questionKey: 'same_color', answer: true }), options)
			const second = append(file, makeOracleLabel({ batch, imageId: 'img-1', questionKey: 'same_color', answer: false }), options)

			const hits = recheckFundedBy([{ id: 'freeze', fundedBy: [first.id, second.id] }], readAll(file))
			assert.equal(hits.length, 1)
			assert.deepEqual(hits[0]!.superseded.map((s) => s.recordId), [first.id])
			assert.equal(hits[0]!.superseded[0]!.replacedById, second.id)
		})

		it('does not flag the answer that stands', () => {
			const file = tempFile()
			const options = det()
			const batch = makeBatch({ id: 'ob2', purpose: 'oracle-validation', itemCount: 1 })
			append(file, makeOracleLabel({ batch, imageId: 'img-1', questionKey: 'same_color', answer: true }), options)
			const second = append(file, makeOracleLabel({ batch, imageId: 'img-1', questionKey: 'same_color', answer: false }), options)
			assert.deepEqual(recheckFundedBy([{ id: 'ok', fundedBy: [second.id] }], readAll(file)), [])
		})

		it('leaves a withdrawn re-answer out of it: the earlier answer stands again', () => {
			const file = tempFile()
			const options = det()
			const batch = makeBatch({ id: 'ob3', purpose: 'oracle-validation', itemCount: 1 })
			const first = append(file, makeOracleLabel({ batch, imageId: 'img-1', questionKey: 'same_color', answer: true }), options)
			const second = append(file, makeOracleLabel({ batch, imageId: 'img-1', questionKey: 'same_color', answer: false }), options)
			append(file, makeAmendment(second.id, {}, { retract: true, reason: 'mis-keyed' }), options)
			assert.deepEqual(recheckFundedBy([{ id: 'ok', fundedBy: [first.id] }], readAll(file)), [])
		})
	})

	describe('evidence that was already withdrawn (F4)', () => {
		it('flags a decision citing evidence retracted before the decision was made', () => {
			// The since-filter is guaranteed to miss this case, and it is the worse one:
			// the evidence was already gone when it was cited.
			const file = tempFile()
			const options = det()
			const verdict = append(file, makeVerdict({ itemId: 'i1' }), options)
			append(file, { ...makeAmendment(verdict.id, {}, { retract: true, reason: 'wrong rendition shown' }), ts: '2026-08-04T00:00:00.000Z' }, options)

			const hits = recheckFundedBy(
				[{ id: 'late', ts: '2026-08-05T00:00:00.000Z', kind: 'metric-freeze', fundedBy: [verdict.id] }],
				readAll(file),
			)
			assert.equal(hits.length, 1, 'a retracted record must fund nothing')
			assert.deepEqual(hits[0]!.retracted, [verdict.id])
			assert.deepEqual(hits[0]!.stale, [], 'the retraction predates the decision, so it is not "since-amended"')
		})

		it('flags it whichever side of the decision the retraction falls on', () => {
			const file = tempFile()
			const options = det()
			const verdict = append(file, makeVerdict({ itemId: 'i1' }), options)
			append(file, { ...makeAmendment(verdict.id, {}, { retract: true, reason: 'withdrawn' }), ts: '2026-08-06T00:00:00.000Z' }, options)
			const hits = recheckFundedBy([{ id: 'early', ts: '2026-08-05T00:00:00.000Z', fundedBy: [verdict.id] }], readAll(file))
			assert.deepEqual(hits[0]!.retracted, [verdict.id])
			assert.equal(hits[0]!.stale.length, 1, 'and it is still reported as amended since')
		})

		it('says nothing about live evidence', () => {
			const { file, v1 } = setup()
			assert.deepEqual(recheckFundedBy([{ id: 'clean', ts: '2026-08-09T00:00:00.000Z', fundedBy: [v1.id] }], readAll(file)), [])
		})
	})
})
