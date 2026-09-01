/**
 * V3 tagging — the v2 validation pass, as a fixture test.
 * Run: NODE_NO_WARNINGS=1 node --experimental-strip-types --test research/v3/tests/tagging-*.test.ts
 *
 * The v1 vocabulary mapped 13 of 13 reviewer observations to **zero** tags: every one was
 * about an instrument or about a criterion, and v1 described palettes only. That 100%
 * zero-tag rate is what the four v2 axes exist to fix, so the fix is pinned here rather
 * than asserted in a report nobody re-runs.
 *
 * The fixture is the work file a **fresh** tagging agent wrote against the committed
 * vocabulary, under the verbatim prompt in `src/tagging/TAGGING_PROTOCOL.md` §4. If the
 * vocabulary moves and this test fails, the answer is to re-run the pass (export → fresh
 * agent → import --supersede) and re-commit the fixture, never to hand-edit it.
 *
 * Honest caveat, recorded by the tagging agent itself: these 13 texts were among the
 * sources the v2 axes were drafted from, so a clean fit here is evidence that the
 * vocabulary *can* express these classes, not that it generalises to unseen comments.
 * The zero-tag rate on future passes is what tests that.
 */

import assert from 'node:assert/strict'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, describe, it } from 'node:test'

import { readAll } from '../src/warehouse/warehouse.ts'
import {
	contradictions,
	DEFAULT_VOCABULARY_PATH,
	kindOf,
	loadVocabulary,
	scopeCounts,
	unknownTags,
} from '../src/tagging/vocabulary.ts'
import { DEFAULT_WAREHOUSE_PATH } from '../src/tagging/export-untagged.ts'
import { importTags, validateWorkFile } from '../src/tagging/import-tags.ts'
import { isFilled, parseWorkFile } from '../src/tagging/work-file.ts'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * The committed v2 validation pass.
 * [MEASURED] — written by a fresh tagging agent on 2026-08-03 against vocabulary 2.1.0.
 */
const FIXTURE_PATH = join(HERE, '..', 'data', 'tagging', 'fixtures', 'v2-validation-pass.json')

/**
 * The four complaint classes the v1 smoke pass could not express, and the axis that now
 * carries each. Every one must be exercised by the pass — a vocabulary addition nobody
 * ever files is not a fix.
 * [REVIEWED] — the four gap classes named in the v2 brief.
 */
const GAP_CLASSES: Array<[string, string]> = [
	['instrument-behavior observation', 'instrument-behavior'],
	['review-instrument feedback / instrument choice', 'instrument-fitness'],
	['detector scope, label-word mismatch', 'concept'],
	['criterion ruling and multi-validity', 'criterion'],
]

const vocabulary = loadVocabulary(DEFAULT_VOCABULARY_PATH)
const work = parseWorkFile(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')), FIXTURE_PATH)
const allTags = work.entries.flatMap((entry) => entry.tags ?? [])

const tempRoots: string[] = []
after(() => {
	for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true })
})

describe('v2 validation pass — the four gap classes', () => {
	it('is a complete pass over the same 13 reviewer observations the v1 smoke pass read', () => {
		assert.equal(work.entries.length, 13)
		assert.equal(work.vocabularyVersion, vocabulary.version, 'the fixture must be re-run when the vocabulary moves')
		for (const entry of work.entries) assert.ok(isFilled(entry), `${entry.sourceId}: every entry must be answered`)
	})

	it('drops the zero-tag rate from 13/13 to 0/13 — the vocabulary-coverage canary', () => {
		const zeroTag = work.entries.filter((entry) => (entry.tags ?? []).length === 0)
		assert.deepEqual(
			zeroTag.map((entry) => entry.sourceId),
			[],
			'an entry mapped to nothing means a complaint class is still missing',
		)
	})

	it('leaves no VOCABULARY GAP marker behind', () => {
		const flagged = work.entries.filter((entry) => (entry.note ?? '').includes('VOCABULARY GAP'))
		assert.deepEqual(
			flagged.map((entry) => entry.sourceId),
			[],
			'a remaining gap must be closed, or documented as out of scope by design',
		)
	})

	it('needed no unsure flag: every mapping was decidable under v2', () => {
		assert.deepEqual(
			work.entries.filter((entry) => entry.unsure === true).map((entry) => entry.sourceId),
			[],
		)
	})

	it('exercises each of the four gap classes at least once', () => {
		for (const [label, axis] of GAP_CLASSES) {
			const used = allTags.filter((tag) => tag.startsWith(`${axis}/`))
			assert.ok(used.length > 0, `${label}: nothing on axis ${axis} was ever filed`)
		}
	})

	it('files instrument and criterion statements at their own scopes, never as palette complaints', () => {
		const counts = scopeCounts(vocabulary, allTags)
		assert.equal(counts.unknown ?? 0, 0)
		assert.ok((counts.instrument ?? 0) > 0, 'instrument-scoped statements must exist')
		assert.ok((counts.criterion ?? 0) > 0, 'criterion-scoped statements must exist')
		assert.ok((counts.artwork ?? 0) > 0, 'the artwork-scoped multi-validity claim must exist')
		// v1 had only pairwise-item tags, which is why all 13 came back empty. None of these
		// observations is about a review item, so none should be filed as one.
		assert.equal(counts['pairwise-item'] ?? 0, 0)
	})

	it('records the multi-validity claim as an artwork-scoped criterion tag, not as a pairwise verdict', () => {
		const entry = work.entries.find((candidate) => candidate.text.includes('can support a valid flat palette'))
		assert.ok(entry, 'the adjudication-browse observation must be in the pass')
		assert.ok(entry!.tags!.includes('criterion/both-readings-defensible'))
		assert.ok(!entry!.tags!.some((tag) => tag.startsWith('meta/')), 'meta is pairwise-item scoped and cannot carry this claim')
	})

	it('uses descriptive tags where the reviewer described and judgment tags where they judged', () => {
		const kinds = new Set(allTags.map((tag) => kindOf(vocabulary, tag)))
		assert.ok(kinds.has('descriptive'), 'the instrument observations must land on the descriptive axis')
		assert.ok(kinds.has('judgment'), 'the rulings and fitness calls must land on judgment axes')
		for (const tag of allTags) assert.ok(kindOf(vocabulary, tag) !== null, `${tag} has no axis kind`)
	})

	it('is internally clean: every tag is in the vocabulary, and no entry carries a tag with its opposite', () => {
		assert.deepEqual(unknownTags(vocabulary, allTags), [])
		for (const entry of work.entries) assert.deepEqual(contradictions(vocabulary, entry.tags ?? []), [], entry.sourceId)
	})
})

describe('v2 validation pass — against the live warehouse', () => {
	const available = existsSync(DEFAULT_WAREHOUSE_PATH)

	it('every source it tagged is a live, taggable record in the warehouse', { skip: !available }, () => {
		const result = validateWorkFile(work, { vocabulary, records: readAll(DEFAULT_WAREHOUSE_PATH) })
		assert.deepEqual(result.problems, [])
		assert.equal(result.filled.length, work.entries.length)
	})

	it('imports cleanly with --supersede semantics, on a copy — the live log is never touched by a test', { skip: !available }, () => {
		const dir = mkdtempSync(join(tmpdir(), 'v3-tagging-validation-'))
		tempRoots.push(dir)
		const copy = join(dir, 'warehouse.jsonl')
		copyFileSync(DEFAULT_WAREHOUSE_PATH, copy)
		const before = readAll(copy).length

		const report = importTags(work, { warehouseFile: copy, vocabulary, supersede: true, fsync: false })
		assert.deepEqual(report.problems, [])
		assert.equal(report.imported, work.entries.length)
		assert.equal(report.zeroTag, 0)
		assert.equal(report.ambiguous.length, 0)
		assert.ok(report.retracted > 0, 'superseding must retract the derived records it replaces')
		assert.ok(readAll(copy).length > before)
		assert.equal(readAll(DEFAULT_WAREHOUSE_PATH).length, before, 'the live warehouse must be unchanged')
	})
})
