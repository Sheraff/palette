/**
 * V3 tagging — export / import tooling tests.
 * Run: NODE_NO_WARNINGS=1 node --experimental-strip-types --test research/v3/tests/tagging-*.test.ts
 */

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'

import { append, readAll, resolve, type Resolved } from '../src/warehouse/warehouse.ts'
import type { NoteRecord, RecordInput, WarehouseRecord } from '../src/warehouse/records.ts'
import {
	counterIds,
	makeAmendment,
	makeArtwork,
	makeBatch,
	makeEndorsedSample,
	makeNote,
	makeVerdict,
	stepClock,
} from '../src/warehouse/fixtures.ts'

import { AMBIGUITY_TAG, DEFAULT_VOCABULARY_PATH, loadVocabulary, scopeOf } from '../src/tagging/vocabulary.ts'
import {
	buildWorkFile,
	collectUntagged,
	derivedIndex,
	freeTextOf,
	runCli as exportCli,
	DEFAULT_WAREHOUSE_PATH as EXPORT_DEFAULT_WAREHOUSE_PATH,
} from '../src/tagging/export-untagged.ts'
import { DEFAULT_WAREHOUSE_PATH as CLI_DEFAULT_WAREHOUSE_PATH } from '../src/warehouse/cli.ts'
import { importTags, runCli as importCli, validateWorkFile } from '../src/tagging/import-tags.ts'
import { parseWorkFile, TAGGING_AGENT, WORK_FILE_FORMAT_VERSION, WORK_FILE_KIND, type WorkFile } from '../src/tagging/work-file.ts'

const vocabulary = loadVocabulary(DEFAULT_VOCABULARY_PATH)

const tempRoots: string[] = []
function tempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), 'v3-tagging-'))
	tempRoots.push(dir)
	return dir
}
after(() => {
	for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true })
})

/** Deterministic append options — one clock and one id counter per warehouse. */
function det() {
	return { now: stepClock(), idFactory: counterIds(), fsync: false }
}

/**
 * A fixture warehouse covering every case the exporter has to get right:
 *  v-1  verdict with a comment                     → exported
 *  v-2  verdict with an empty comment              → never exported
 *  n-3  human note                                 → exported
 *  v-4  verdict, superseded by a later save (v-5)  → only v-5 exported
 *  v-6  verdict, retracted                         → never exported
 *  e-7  endorsed-sample comment                    → exported only with --type
 *  v-8  verdict whose comment was amended          → exported, with the amended text
 */
function fixtureWarehouse(): { file: string; options: ReturnType<typeof det> } {
	const file = join(tempDir(), 'warehouse.jsonl')
	const options = det()
	const batch = makeBatch({ id: 'b1', itemCount: 6 })

	append(file, makeVerdict({ batch, itemId: 'i1', comment: 'the accent is grey, this cover is all about the red stripe' }), options)
	append(file, makeVerdict({ batch, itemId: 'i2', comment: '' }), options)
	append(file, makeNote({ batch, itemId: 'i3', artwork: makeArtwork({ name: 'c3.jpg' }), text: 'I can barely read the title' }), options)
	append(file, makeVerdict({ batch, itemId: 'i4', comment: 'first draft of my thoughts' }), options)
	append(file, makeVerdict({ batch, itemId: 'i4', comment: 'actually the gradient should not be here at all' }), options)
	const retracted = append(file, makeVerdict({ batch, itemId: 'i5', comment: 'ignore me' }), options)
	append(file, makeAmendment(retracted.id, {}, { retract: true, reason: 'misclick' }), options)
	append(file, makeEndorsedSample({ batch, itemId: 'i6', comment: 'this is the palette I wanted' }), options)
	const amended = append(file, makeVerdict({ batch, itemId: 'i7', comment: 'looks fine' }), options)
	append(file, makeAmendment(amended.id, { comment: 'on reflection the panel fights the background' }), options)

	return { file, options }
}

function entryFor(work: WorkFile, sourceId: string) {
	return work.entries.find((entry) => entry.sourceId === sourceId)
}

/** Fill a work file the way a tagging subagent would. */
function fill(work: WorkFile, tagsBySourceId: Record<string, string[]>, extra: Record<string, { unsure?: boolean; note?: string }> = {}): WorkFile {
	return {
		...work,
		entries: work.entries.map((entry) => ({
			...entry,
			tags: tagsBySourceId[entry.sourceId] ?? [],
			...(extra[entry.sourceId] ?? {}),
		})),
	}
}

function derivedNotes(file: string): NoteRecord[] {
	return readAll(file).filter((record): record is NoteRecord => record.type === 'note' && record.derived !== null)
}

// ---------------------------------------------------------------------------

describe('export — what counts as untagged free text', () => {
	it('exports verdict comments and human notes, and nothing else by default', () => {
		const { file } = fixtureWarehouse()
		const { file: work } = buildWorkFile(readAll(file), { warehouseFile: file, vocabulary, now: () => 0 })
		assert.deepEqual(
			work.entries.map((entry) => entry.sourceType),
			['verdict', 'note', 'verdict', 'verdict'],
		)
	})

	it('skips empty comments, retracted sources, and superseded pre-release drafts', () => {
		const { file } = fixtureWarehouse()
		const { file: work } = buildWorkFile(readAll(file), { warehouseFile: file, vocabulary, now: () => 0 })
		const texts = work.entries.map((entry) => entry.text)
		assert.ok(!texts.includes(''), 'an empty comment is not free text')
		assert.ok(!texts.includes('ignore me'), 'a retracted verdict is not evidence')
		assert.ok(!texts.includes('first draft of my thoughts'), 'a superseded draft must not be tagged twice')
		assert.ok(texts.includes('actually the gradient should not be here at all'))
	})

	it('exports the amended text, not the original', () => {
		const { file } = fixtureWarehouse()
		const { file: work } = buildWorkFile(readAll(file), { warehouseFile: file, vocabulary, now: () => 0 })
		const texts = work.entries.map((entry) => entry.text)
		assert.ok(texts.includes('on reflection the panel fights the background'))
		assert.ok(!texts.includes('looks fine'))
	})

	it('widens to other free-text record types on request', () => {
		const { file } = fixtureWarehouse()
		const { file: work } = buildWorkFile(readAll(file), {
			warehouseFile: file,
			vocabulary,
			sourceTypes: ['verdict', 'note', 'endorsed-sample'],
			now: () => 0,
		})
		assert.ok(work.entries.some((entry) => entry.text === 'this is the palette I wanted'))
	})

	it('carries context that disambiguates the text — and never a variant id', () => {
		const { file } = fixtureWarehouse()
		const { file: work } = buildWorkFile(readAll(file), { warehouseFile: file, vocabulary, now: () => 0 })
		const entry = work.entries[0]!
		assert.equal(entry.context.batchId, 'b1')
		assert.equal(entry.context.batchPurpose, 'arm')
		assert.equal(entry.context.itemId, 'i1')
		assert.equal(entry.context.gradeA, 'strong')
		assert.equal(entry.context.gradeB, 'acceptable')
		assert.ok(entry.context.artworkPath?.startsWith('/'))
		assert.ok(!JSON.stringify(work).includes('arm/foo'), 'the work file must never leak the blinding key')
		assert.ok(!JSON.stringify(work).includes('"trunk"'))
	})

	it('honours a batch filter and a limit, and reports what it truncated', () => {
		const { file } = fixtureWarehouse()
		const records = readAll(file)
		assert.equal(collectUntagged(records, { vocabulary, batchIds: ['nope'] }).entries.length, 0)
		const limited = collectUntagged(records, { vocabulary, limit: 2 })
		assert.equal(limited.entries.length, 2)
		assert.equal(limited.truncated, 2)
	})

	it('never offers a derived record as a source — the tagger does not tag itself', () => {
		const { file, options } = fixtureWarehouse()
		const derived: RecordInput<NoteRecord> = {
			...makeNote({ text: 'agent rationale', tags: ['coverage/too-dark'] }),
			author: { kind: 'agent', id: TAGGING_AGENT },
			derived: { fromRecordId: 'v-999', agent: TAGGING_AGENT, agentVersion: vocabulary.version },
		}
		const stored = append(file, derived, options)
		assert.equal(freeTextOf(stored as NoteRecord), null)
		const { file: work } = buildWorkFile(readAll(file), { warehouseFile: file, vocabulary, now: () => 0 })
		assert.equal(entryFor(work, stored.id), undefined)
	})

	it('produces a well-formed work file that parseWorkFile accepts', () => {
		const { file } = fixtureWarehouse()
		const { file: work } = buildWorkFile(readAll(file), { warehouseFile: file, vocabulary, now: () => 0 })
		assert.equal(work.kind, WORK_FILE_KIND)
		assert.equal(work.formatVersion, WORK_FILE_FORMAT_VERSION)
		assert.equal(work.vocabularyVersion, vocabulary.version)
		assert.equal(work.agent, TAGGING_AGENT)
		assert.doesNotThrow(() => parseWorkFile(JSON.parse(JSON.stringify(work))))
	})

	it('shares the warehouse default path with the warehouse CLI', () => {
		assert.equal(EXPORT_DEFAULT_WAREHOUSE_PATH, CLI_DEFAULT_WAREHOUSE_PATH)
	})
})

describe('import — round trip', () => {
	it('files one derived note per filled entry, pointing back at its source', () => {
		const { file, options } = fixtureWarehouse()
		const { file: work } = buildWorkFile(readAll(file), { warehouseFile: file, vocabulary, now: () => 0 })
		const first = work.entries[0]!
		const filled = fill(work, { [first.sourceId]: ['role/accent-should-be-chromatic', 'identity/signature-color-missing'] }, {
			[first.sourceId]: { note: 'the reviewer names the red stripe as the identity' },
		})

		const report = importTags(filled, { warehouseFile: file, vocabulary, ...options })
		assert.equal(report.problems.length, 0)
		assert.equal(report.imported, work.entries.length)

		const notes = derivedNotes(file)
		assert.equal(notes.length, work.entries.length)
		const note = notes.find((n) => n.derived!.fromRecordId === first.sourceId)!
		assert.deepEqual(note.tags, ['role/accent-should-be-chromatic', 'identity/signature-color-missing'])
		assert.equal(note.text, 'the reviewer names the red stripe as the identity')
		assert.deepEqual(note.author, { kind: 'agent', id: TAGGING_AGENT })
		assert.equal(note.derived!.agent, TAGGING_AGENT)
		assert.equal(note.derived!.agentVersion, vocabulary.version)
		assert.equal(note.batch!.id, 'b1')
		assert.equal(note.itemId, 'i1')
		assert.ok(note.artwork)
	})

	it('leaves the raw text untouched — the derived note never copies it', () => {
		const { file, options } = fixtureWarehouse()
		const before = readAll(file)
		const { file: work } = buildWorkFile(before, { warehouseFile: file, vocabulary, now: () => 0 })
		importTags(fill(work, {}), { warehouseFile: file, vocabulary, ...options })
		const after = readAll(file)
		for (const record of before) {
			const same = after.find((r) => r.id === record.id)
			assert.deepEqual(same, record, 'no existing record may be rewritten')
		}
	})

	it('a re-export after import finds nothing left to tag', () => {
		const { file, options } = fixtureWarehouse()
		const { file: work } = buildWorkFile(readAll(file), { warehouseFile: file, vocabulary, now: () => 0 })
		importTags(fill(work, {}), { warehouseFile: file, vocabulary, ...options })
		const second = collectUntagged(readAll(file), { vocabulary })
		assert.equal(second.entries.length, 0)
		assert.equal(second.alreadyTagged, work.entries.length)
	})

	it('counts a zero-tag entry as done — it is a real answer, and the coverage canary', () => {
		const { file, options } = fixtureWarehouse()
		const { file: work } = buildWorkFile(readAll(file), { warehouseFile: file, vocabulary, now: () => 0 })
		const report = importTags(fill(work, {}), { warehouseFile: file, vocabulary, ...options })
		assert.equal(report.zeroTag, work.entries.length)
		assert.equal(derivedNotes(file).length, work.entries.length)
		for (const note of derivedNotes(file)) assert.deepEqual(note.tags, [])
	})
})

describe('import — the v2 vocabulary shape', () => {
	it('files a descriptive tag beside its counterpart — two observations are not a contradiction', () => {
		const { file, options } = fixtureWarehouse()
		const { file: work } = buildWorkFile(readAll(file), { warehouseFile: file, vocabulary, now: () => 0 })
		const source = work.entries[0]!.sourceId
		const report = importTags(
			fill(work, {
				[source]: ['instrument-behavior/attends-to-appearance', 'instrument-behavior/attends-to-semantics'],
			}),
			{ warehouseFile: file, vocabulary, ...options },
		)
		assert.equal(report.problems.length, 0, 'counterparts are alternatives, not opposites')
		const note = derivedNotes(file).find((n) => n.derived!.fromRecordId === source)!
		assert.deepEqual(note.tags, ['instrument-behavior/attends-to-appearance', 'instrument-behavior/attends-to-semantics'])
	})

	it('still refuses a judgment tag filed with its opposite, on the new axes too', () => {
		const { file, options } = fixtureWarehouse()
		const { file: work } = buildWorkFile(readAll(file), { warehouseFile: file, vocabulary, now: () => 0 })
		const report = importTags(
			fill(work, { [work.entries[0]!.sourceId]: ['criterion/ruling-given', 'criterion/underdetermined'] }),
			{ warehouseFile: file, vocabulary, ...options },
		)
		assert.ok(report.problems.some((p) => p.kind === 'contradiction'))
	})

	it('reports the scope breakdown next to the zero-tag rate — the instrument-blindness canary', () => {
		const { file, options } = fixtureWarehouse()
		const { file: work } = buildWorkFile(readAll(file), { warehouseFile: file, vocabulary, now: () => 0 })
		const [a, b] = [work.entries[0]!.sourceId, work.entries[1]!.sourceId]
		const report = importTags(
			fill(work, {
				[a!]: ['coverage/too-dark', 'criterion/both-readings-defensible'],
				[b!]: ['instrument-behavior/instruments-differ', 'concept/label-too-broad'],
			}),
			{ warehouseFile: file, vocabulary, ...options },
		)
		assert.deepEqual(report.scopeCounts, { 'pairwise-item': 1, artwork: 1, instrument: 1, criterion: 1 })
	})

	it('counts the ambiguity tag at instrument scope — it is about the tagging agent, not the pair', () => {
		const { file, options } = fixtureWarehouse()
		const { file: work } = buildWorkFile(readAll(file), { warehouseFile: file, vocabulary, now: () => 0 })
		const source = work.entries[0]!.sourceId
		const report = importTags(fill(work, { [source]: ['meta/both-sides-good'] }, { [source]: { unsure: true } }), {
			warehouseFile: file,
			vocabulary,
			...options,
		})
		// `meta/tagger-unsure` is appended by the importer, so it is not in scopeCounts;
		// what matters is that the vocabulary places it away from the pairwise claim.
		assert.equal(scopeOf(vocabulary, 'meta/both-sides-good'), 'pairwise-item')
		assert.equal(scopeOf(vocabulary, AMBIGUITY_TAG), 'instrument')
		assert.equal(report.ambiguous.length, 1)
	})
})

describe('import — idempotency', () => {
	it('re-importing the same work file appends nothing', () => {
		const { file, options } = fixtureWarehouse()
		const { file: work } = buildWorkFile(readAll(file), { warehouseFile: file, vocabulary, now: () => 0 })
		const filled = fill(work, { [work.entries[0]!.sourceId]: ['coverage/too-dark'] })

		const first = importTags(filled, { warehouseFile: file, vocabulary, ...options })
		const afterFirst = readAll(file).length
		const second = importTags(filled, { warehouseFile: file, vocabulary, ...options })

		assert.equal(first.imported, work.entries.length)
		assert.equal(second.imported, 0)
		assert.equal(second.skippedAlreadyDerived, work.entries.length)
		assert.equal(readAll(file).length, afterFirst, 'the log must not grow on a repeat import')
	})

	it('--supersede retracts the old derived records and files fresh ones', () => {
		const { file, options } = fixtureWarehouse()
		const { file: work } = buildWorkFile(readAll(file), { warehouseFile: file, vocabulary, now: () => 0 })
		const source = work.entries[0]!.sourceId
		importTags(fill(work, { [source]: ['coverage/too-dark'] }), { warehouseFile: file, vocabulary, ...options })
		const report = importTags(fill(work, { [source]: ['coverage/too-light'] }), {
			warehouseFile: file,
			vocabulary,
			supersede: true,
			...options,
		})

		assert.equal(report.imported, work.entries.length)
		assert.equal(report.retracted, work.entries.length)
		const live = resolve(readAll(file)).filter(
			(entry: Resolved) => entry.record.type === 'note' && (entry.record as NoteRecord).derived !== null && !entry.retracted,
		)
		assert.equal(live.length, work.entries.length, 'exactly one live derived record per source')
		const current = live.find((entry) => (entry.record as NoteRecord).derived!.fromRecordId === source)!
		assert.deepEqual((current.record as NoteRecord).tags, ['coverage/too-light'])
	})

	it('re-exports a source whose text was amended after it was tagged', () => {
		const { file, options } = fixtureWarehouse()
		const { file: work } = buildWorkFile(readAll(file), { warehouseFile: file, vocabulary, now: () => 0 })
		const source = work.entries[0]!.sourceId
		importTags(fill(work, { [source]: ['coverage/too-dark'] }), { warehouseFile: file, vocabulary, ...options })
		assert.equal(collectUntagged(readAll(file), { vocabulary }).entries.length, 0)

		append(file, makeAmendment(source, { comment: 'second thoughts: the accent is fine, the surface is not' }), options)
		const again = collectUntagged(readAll(file), { vocabulary })
		assert.equal(again.entries.length, 1)
		assert.equal(again.staleAmended, 1)
		assert.equal(again.entries[0]!.text, 'second thoughts: the accent is fine, the surface is not')
	})

	it('re-exports everything when the vocabulary version moves, unless told not to', () => {
		const { file, options } = fixtureWarehouse()
		const { file: work } = buildWorkFile(readAll(file), { warehouseFile: file, vocabulary, now: () => 0 })
		importTags(fill(work, {}), { warehouseFile: file, vocabulary, ...options })

		const moved = { ...vocabulary, version: '2.0.0' }
		assert.equal(collectUntagged(readAll(file), { vocabulary: moved }).staleVersion, work.entries.length)
		assert.equal(collectUntagged(readAll(file), { vocabulary: moved, anyVersion: true }).entries.length, 0)
	})

	it('a version bump restages the whole index: everything goes stale, --supersede leaves one live record each', () => {
		// This is the v1.0.0 → v2.x path the vocabulary actually took, in miniature.
		const { file, options } = fixtureWarehouse()
		const older = { ...vocabulary, version: '1.0.0' }
		const { file: firstPass } = buildWorkFile(readAll(file), { warehouseFile: file, vocabulary: older, now: () => 0 })
		importTags(fill(firstPass, { [firstPass.entries[0]!.sourceId]: ['coverage/too-dark'] }), {
			warehouseFile: file,
			vocabulary: older,
			...options,
		})

		const restaged = collectUntagged(readAll(file), { vocabulary })
		assert.equal(restaged.staleVersion, firstPass.entries.length, 'a bump re-offers every source')
		assert.equal(restaged.entries.length, firstPass.entries.length)

		const { file: secondPass } = buildWorkFile(readAll(file), { warehouseFile: file, vocabulary, now: () => 1 })
		const report = importTags(
			fill(secondPass, { [secondPass.entries[0]!.sourceId]: ['instrument-behavior/attends-to-outside-identity'] }),
			{ warehouseFile: file, vocabulary, supersede: true, ...options },
		)
		assert.equal(report.retracted, firstPass.entries.length)
		assert.equal(report.imported, secondPass.entries.length)

		const live = resolve(readAll(file)).filter(
			(entry: Resolved) => entry.record.type === 'note' && (entry.record as NoteRecord).derived !== null && !entry.retracted,
		)
		assert.equal(live.length, secondPass.entries.length, 'exactly one live derived record per source')
		for (const entry of live) assert.equal((entry.record as NoteRecord).derived!.agentVersion, vocabulary.version)
		assert.equal(collectUntagged(readAll(file), { vocabulary }).entries.length, 0, 'nothing is left stale afterwards')
	})

	it('derivedIndex only counts this agent, and ignores retracted records', () => {
		const { file, options } = fixtureWarehouse()
		const { file: work } = buildWorkFile(readAll(file), { warehouseFile: file, vocabulary, now: () => 0 })
		const source = work.entries[0]!.sourceId
		const other: RecordInput<NoteRecord> = {
			...makeNote({ text: '', tags: [] }),
			author: { kind: 'agent', id: 'some-other-agent' },
			derived: { fromRecordId: source, agent: 'some-other-agent', agentVersion: vocabulary.version },
		}
		append(file, other, options)
		assert.equal(derivedIndex(resolve(readAll(file)), TAGGING_AGENT).size, 0)
		assert.equal(derivedIndex(resolve(readAll(file)), 'some-other-agent').size, 1)
		assert.equal(collectUntagged(readAll(file), { vocabulary }).entries.length, work.entries.length)
	})
})

describe('import — validation', () => {
	function setup() {
		const { file, options } = fixtureWarehouse()
		const { file: work } = buildWorkFile(readAll(file), { warehouseFile: file, vocabulary, now: () => 0 })
		return { file, options, work, records: readAll(file) }
	}

	it('rejects an out-of-vocabulary tag and writes nothing', () => {
		const { file, options, work } = setup()
		const before = readAll(file).length
		const report = importTags(fill(work, { [work.entries[0]!.sourceId]: ['coverage/way-too-purple'] }), {
			warehouseFile: file,
			vocabulary,
			...options,
		})
		assert.equal(report.problems.filter((p) => p.kind === 'unknown-tag').length, 1)
		assert.equal(report.skippedInvalid, 1)
		assert.equal(report.imported, work.entries.length - 1, 'the other entries still land')
		assert.equal(readAll(file).length, before + work.entries.length - 1)
		assert.ok(!derivedNotes(file).some((note) => note.tags.includes('coverage/way-too-purple')))
	})

	it('rejects a tag filed together with its own opposite', () => {
		const { file, options, work } = setup()
		const report = importTags(fill(work, { [work.entries[0]!.sourceId]: ['coverage/too-dark', 'coverage/too-light'] }), {
			warehouseFile: file,
			vocabulary,
			...options,
		})
		const problem = report.problems.find((p) => p.kind === 'contradiction')
		assert.ok(problem)
		assert.match(problem!.message, /its opposite/)
		assert.equal(report.skippedInvalid, 1)
	})

	it('rejects a source id that is not in the warehouse', () => {
		const { file, options, work } = setup()
		const broken: WorkFile = { ...work, entries: [{ ...work.entries[0]!, sourceId: 'v-does-not-exist', tags: [] }] }
		const report = importTags(broken, { warehouseFile: file, vocabulary, ...options })
		assert.equal(report.problems[0]!.kind, 'missing-source')
		assert.equal(report.imported, 0)
		assert.equal(derivedNotes(file).length, 0)
	})

	it('rejects a duplicated source id inside one work file', () => {
		const { file, options, work } = setup()
		const entry = { ...work.entries[0]!, tags: [] }
		const report = importTags({ ...work, entries: [entry, { ...entry }] }, { warehouseFile: file, vocabulary, ...options })
		assert.ok(report.problems.some((p) => p.kind === 'duplicate-source'))
		assert.equal(report.imported, 0)
	})

	it('refuses the whole file when it was exported against another vocabulary version', () => {
		const { file, options, work } = setup()
		const drifted: WorkFile = { ...fill(work, {}), vocabularyVersion: '0.0.9' }
		const report = importTags(drifted, { warehouseFile: file, vocabulary, ...options })
		assert.equal(report.problems[0]!.kind, 'vocabulary-drift')
		assert.equal(report.imported, 0)
		assert.equal(derivedNotes(file).length, 0)

		const forced = importTags(drifted, { warehouseFile: file, vocabulary, allowVocabularyDrift: true, ...options })
		assert.equal(forced.problems.length, 0)
		assert.equal(forced.imported, work.entries.length)
	})

	it('reports unfilled entries instead of importing them', () => {
		const { file, options, work } = setup()
		const report = importTags(work, { warehouseFile: file, vocabulary, ...options })
		assert.equal(report.unfilled, work.entries.length)
		assert.equal(report.filled, 0)
		assert.equal(report.imported, 0)
	})

	it('collects unsure entries and adds the ambiguity tag to their derived records', () => {
		const { file, options, work } = setup()
		const source = work.entries[0]!.sourceId
		const report = importTags(fill(work, { [source]: ['gradient/should-be-flat'] }, { [source]: { unsure: true } }), {
			warehouseFile: file,
			vocabulary,
			...options,
		})
		assert.equal(report.ambiguous.length, 1)
		const note = derivedNotes(file).find((n) => n.derived!.fromRecordId === source)!
		assert.deepEqual(note.tags, ['gradient/should-be-flat', 'meta/tagger-unsure'])
	})

	it('a dry run validates and reports without writing', () => {
		const { file, options, work } = setup()
		const before = readAll(file).length
		const report = importTags(fill(work, {}), { warehouseFile: file, vocabulary, dryRun: true, ...options })
		assert.equal(report.dryRun, true)
		assert.equal(report.imported, work.entries.length)
		assert.equal(readAll(file).length, before)
	})

	it('validateWorkFile refuses a derived note as a source', () => {
		const { file, options, work, records } = setup()
		const derived = append(
			file,
			{ ...makeNote({ text: '', tags: [] }), author: { kind: 'agent', id: TAGGING_AGENT }, derived: { fromRecordId: work.entries[0]!.sourceId, agent: TAGGING_AGENT, agentVersion: vocabulary.version } } as RecordInput<NoteRecord>,
			options,
		)
		const result = validateWorkFile(
			{ ...work, entries: [{ ...work.entries[0]!, sourceId: derived.id, tags: [] }] },
			{ vocabulary, records: [...records, derived as WarehouseRecord] },
		)
		assert.equal(result.problems[0]!.kind, 'untaggable-source')
	})
})

describe('CLI round trip', () => {
	it('export writes a file, import reads it back, and a second import is a no-op', () => {
		const { file } = fixtureWarehouse()
		const dir = tempDir()
		const workPath = join(dir, 'work.json')

		const exported = exportCli(['--file', file, '--out', workPath, '--quiet'])
		assert.equal(exported.code, 0, exported.err)
		assert.equal(exported.out.trim(), workPath)

		const work = parseWorkFile(JSON.parse(readFileSync(workPath, 'utf8')), workPath)
		assert.ok(work.entries.length > 0)
		assert.ok(work.instructions.includes('TAGGING_PROTOCOL.md'))

		writeFileSync(
			workPath,
			JSON.stringify(fill(work, { [work.entries[0]!.sourceId]: ['contrast/text-too-low'] }, { [work.entries[1]!.sourceId]: { unsure: true } })),
			'utf8',
		)

		const imported = importCli([workPath, '--file', file])
		assert.equal(imported.code, 0, imported.out)
		assert.match(imported.out, new RegExp(`imported=${work.entries.length}`))

		const again = importCli([workPath, '--file', file])
		assert.equal(again.code, 0, again.out)
		assert.match(again.out, /imported=0/)
		assert.match(again.out, new RegExp(`already-derived=${work.entries.length}`))

		const reexport = exportCli(['--file', file, '--out', join(dir, 'work2.json'), '--quiet'])
		assert.equal(reexport.code, 0)
		assert.equal(parseWorkFile(JSON.parse(readFileSync(join(dir, 'work2.json'), 'utf8'))).entries.length, 0)
	})

	it('import exits non-zero and names the problem on an out-of-vocabulary tag', () => {
		const { file } = fixtureWarehouse()
		const dir = tempDir()
		const workPath = join(dir, 'work.json')
		exportCli(['--file', file, '--out', workPath, '--quiet'])
		const work = parseWorkFile(JSON.parse(readFileSync(workPath, 'utf8')))
		writeFileSync(workPath, JSON.stringify(fill(work, { [work.entries[0]!.sourceId]: ['not/a-real-tag'] })), 'utf8')

		const result = importCli([workPath, '--file', file])
		assert.equal(result.code, 1)
		assert.match(result.out, /problem unknown-tag/)
	})

	it('import writes the ambiguous entries out for a human when asked', () => {
		const { file } = fixtureWarehouse()
		const dir = tempDir()
		const workPath = join(dir, 'work.json')
		const ambiguousPath = join(dir, 'ambiguous.json')
		exportCli(['--file', file, '--out', workPath, '--quiet'])
		const work = parseWorkFile(JSON.parse(readFileSync(workPath, 'utf8')))
		writeFileSync(workPath, JSON.stringify(fill(work, {}, { [work.entries[0]!.sourceId]: { unsure: true } })), 'utf8')

		const result = importCli([workPath, '--file', file, '--ambiguous', ambiguousPath])
		assert.equal(result.code, 0, result.out)
		const held = parseWorkFile(JSON.parse(readFileSync(ambiguousPath, 'utf8')))
		assert.equal(held.entries.length, 1)
		assert.equal(held.entries[0]!.sourceId, work.entries[0]!.sourceId)
	})

	it('export rejects an unknown or untaggable --type', () => {
		const { file } = fixtureWarehouse()
		assert.equal(exportCli(['--file', file, '--type', 'nonsense', '--stdout']).code, 2)
		assert.equal(exportCli(['--file', file, '--type', 'amendment', '--stdout']).code, 2)
	})

	it('import without a work file argument explains itself', () => {
		const result = importCli([])
		assert.equal(result.code, 2)
		assert.match(result.err, /usage/)
	})
})
