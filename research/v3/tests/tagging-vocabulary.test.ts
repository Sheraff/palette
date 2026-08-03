/**
 * V3 tagging — vocabulary and symmetry-linter tests.
 * Run: NODE_NO_WARNINGS=1 node --experimental-strip-types --test research/v3/tests/tagging-*.test.ts
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
	AMBIGUITY_TAG,
	assertVocabulary,
	contradictions,
	DEFAULT_VOCABULARY_PATH,
	lintVocabulary,
	loadVocabulary,
	oppositeOf,
	parseVocabulary,
	tagById,
	tagIds,
	tagPairs,
	tagsOfAxis,
	TaggingError,
	unknownTags,
	type Vocabulary,
} from '../src/tagging/vocabulary.ts'
import { renderTagsMarkdown, runCli as buildTagsCli } from '../src/tagging/build-tags-md.ts'

const vocabulary = loadVocabulary(DEFAULT_VOCABULARY_PATH)

/** A minimal, well-formed vocabulary the negative tests mutate. */
function toy(): Vocabulary {
	return {
		version: '0.0.1',
		updated: '2026-08-03',
		rule: 'toy',
		epistemics: 'toy',
		axes: [{ id: 'x', title: 'X', about: 'about x' }],
		tags: [
			{ id: 'x/up', axis: 'x', opposite: 'x/down', definition: 'goes up', example: 'it is too low' },
			{ id: 'x/down', axis: 'x', opposite: 'x/up', definition: 'goes down', example: 'it is too high' },
		],
	}
}

describe('committed vocabulary', () => {
	it('loads and passes every lint check', () => {
		assert.deepEqual(lintVocabulary(vocabulary), [])
	})

	it('is symmetric: every opposite exists, is mutual, is not the tag itself, and shares its axis', () => {
		for (const tag of vocabulary.tags) {
			const other = tagById(vocabulary, tag.opposite)
			assert.ok(other, `${tag.id}: opposite ${tag.opposite} must exist`)
			assert.notEqual(tag.opposite, tag.id, `${tag.id}: must not be its own opposite`)
			assert.equal(other!.opposite, tag.id, `${tag.id}: opposite must be mutual`)
			assert.equal(other!.axis, tag.axis, `${tag.id}: opposite must share the axis`)
		}
	})

	it('partitions cleanly into pairs, two tags per pair, every tag used once', () => {
		const pairs = tagPairs(vocabulary)
		assert.equal(pairs.length * 2, vocabulary.tags.length)
		const flat = pairs.flat()
		assert.equal(new Set(flat).size, vocabulary.tags.length)
		assert.deepEqual([...flat].sort(), [...tagIds(vocabulary)].sort())
	})

	it('covers every axis named by the Phase 0 brief, each with at least one pair', () => {
		const expected = ['gradient', 'coverage', 'role', 'contrast', 'collapse', 'identity', 'provenance', 'meta']
		assert.deepEqual(
			vocabulary.axes.map((axis) => axis.id),
			expected,
		)
		for (const axis of expected) assert.ok(tagsOfAxis(vocabulary, axis).length >= 2, `${axis} needs at least one pair`)
	})

	it('carries the v2-3 complaint classes the field guide names, in both directions', () => {
		// The classes v2-3 could actually express or was measured to need. Each must now
		// have a two-way entry — that is what the symmetric-vocabulary rule buys.
		const required = [
			// the instrument-bias gap itself (all 14 gradient notes pointed one way)
			['gradient/should-be-gradient', 'gradient/should-be-flat'],
			// v2-3 starter tag `wrong-midpoint`, which had no direction at all
			['gradient/midpoint-too-early', 'gradient/midpoint-too-late'],
			// `incomplete-identity` — the most frequent class, 27 notes
			['identity/coverage-shortfall', 'identity/coverage-overreach'],
			// `wrong-role` — 16% of corrections were pure permutations
			['role/wrong-role-assignment', 'role/wrong-color-selection'],
			// the surface lane that could never take a chromatic color — 14 complaints
			['role/surface-should-be-chromatic', 'role/surface-should-be-neutral'],
			// `contrast`, which v2-3 could only ever mean "too little"
			['contrast/text-too-low', 'contrast/text-too-high'],
			// REVIEW_UI.md §4's own worked examples
			['coverage/missing-color', 'coverage/alien-color'],
		]
		for (const [a, b] of required) {
			assert.ok(tagById(vocabulary, a!), `${a} must exist`)
			assert.equal(oppositeOf(vocabulary, a!), b)
			assert.equal(oppositeOf(vocabulary, b!), a)
		}
	})

	it('gives every tag a distinct definition and a distinct example phrase', () => {
		assert.equal(new Set(vocabulary.tags.map((t) => t.definition)).size, vocabulary.tags.length)
		assert.equal(new Set(vocabulary.tags.map((t) => t.example)).size, vocabulary.tags.length)
	})

	it('declares the ambiguity tag, and gives it an opposite like everything else', () => {
		assert.ok(tagById(vocabulary, AMBIGUITY_TAG))
		const opposite = oppositeOf(vocabulary, AMBIGUITY_TAG)
		assert.ok(opposite)
		assert.equal(oppositeOf(vocabulary, opposite!), AMBIGUITY_TAG)
	})
})

describe('symmetry linter — negative cases', () => {
	it('rejects an opposite that does not exist', () => {
		const v = toy()
		v.tags[0]!.opposite = 'x/sideways'
		const issues = lintVocabulary(v)
		assert.equal(issues.filter((i) => i.kind === 'symmetry').length >= 1, true)
		assert.match(issues[0]!.message, /does not exist/)
	})

	it('rejects a tag that is its own opposite', () => {
		const v = toy()
		v.tags[0]!.opposite = 'x/up'
		const issues = lintVocabulary(v)
		assert.ok(issues.some((i) => i.kind === 'symmetry' && /own opposite/.test(i.message)))
	})

	it('rejects a one-way opposite — exactly the v2-3 instrument-bias shape', () => {
		const v = toy()
		v.tags.push({ id: 'x/sideways', axis: 'x', opposite: 'x/up', definition: 'd3', example: 'e3' })
		v.tags.push({ id: 'x/other', axis: 'x', opposite: 'x/spare', definition: 'd4', example: 'e4' })
		v.tags.push({ id: 'x/spare', axis: 'x', opposite: 'x/other', definition: 'd5', example: 'e5' })
		const issues = lintVocabulary(v)
		assert.ok(issues.some((i) => i.kind === 'symmetry' && /not mutual/.test(i.message)))
	})

	it('rejects an opposite on a different axis', () => {
		const v = toy()
		v.axes.push({ id: 'y', title: 'Y', about: 'about y' })
		v.tags.push({ id: 'y/left', axis: 'y', opposite: 'y/right', definition: 'd3', example: 'e3' })
		v.tags.push({ id: 'y/right', axis: 'y', opposite: 'y/left', definition: 'd4', example: 'e4' })
		v.tags[0]!.opposite = 'y/left'
		v.tags[2]!.opposite = 'x/up'
		const issues = lintVocabulary(v)
		assert.ok(issues.some((i) => i.kind === 'symmetry' && /sits on axis/.test(i.message)))
	})

	it('rejects an axis with an odd number of tags', () => {
		const v = toy()
		v.tags.push({ id: 'x/lonely', axis: 'x', opposite: 'x/up', definition: 'd3', example: 'e3' })
		const issues = lintVocabulary(v)
		assert.ok(issues.some((i) => i.kind === 'symmetry' && /cannot be a set of pairs/.test(i.message)))
	})

	it('rejects an undeclared axis, a mismatched id prefix, a bad id shape, and duplicates', () => {
		const v = toy()
		v.tags.push({ id: 'z/Weird_Id', axis: 'z', opposite: 'x/up', definition: 'd3', example: 'e3' })
		v.tags.push({ id: 'x/up', axis: 'x', opposite: 'x/down', definition: 'd4', example: 'e4' })
		const kinds = new Set(lintVocabulary(v).map((i) => i.kind))
		assert.ok(kinds.has('axis'))
		assert.ok(kinds.has('shape'))
		assert.ok(kinds.has('duplicate'))
	})

	it('rejects duplicated definitions and example phrases', () => {
		const v = toy()
		v.tags[1]!.definition = v.tags[0]!.definition
		v.tags[1]!.example = v.tags[0]!.example
		const issues = lintVocabulary(v).filter((i) => i.kind === 'text')
		assert.equal(issues.length, 2)
	})

	it('assertVocabulary throws a TaggingError naming every issue', () => {
		const v = toy()
		// Breaking one side of a pair necessarily breaks two checks: the dangling
		// opposite, and the other side's mutuality. That coupling is the point.
		v.tags[0]!.opposite = 'x/nope'
		assert.throws(
			() => assertVocabulary(v),
			(error: unknown) =>
				error instanceof TaggingError &&
				/failed 2 check\(s\)/.test(error.message) &&
				/does not exist/.test(error.message) &&
				/not mutual/.test(error.message),
		)
	})

	it('assertVocabulary is a no-op on a clean vocabulary', () => {
		assert.doesNotThrow(() => assertVocabulary(toy()))
	})

	it('loadVocabulary refuses a file that fails the linter', () => {
		assert.throws(() => loadVocabulary('/nonexistent/vocabulary.json'), TaggingError)
	})

	it('parseVocabulary rejects a malformed file before the linter ever sees it', () => {
		assert.throws(() => parseVocabulary({ version: '1' }), TaggingError)
		assert.throws(() => parseVocabulary(null), TaggingError)
	})
})

describe('vocabulary queries', () => {
	it('unknownTags reports out-of-vocabulary ids once each, in order', () => {
		assert.deepEqual(unknownTags(vocabulary, ['coverage/missing-color', 'made/up', 'made/up', 'also/invented']), [
			'made/up',
			'also/invented',
		])
		assert.deepEqual(unknownTags(vocabulary, tagIds(vocabulary)), [])
	})

	it('contradictions finds a tag filed together with its own opposite', () => {
		assert.deepEqual(contradictions(vocabulary, ['coverage/too-dark', 'coverage/too-light']), [
			['coverage/too-dark', 'coverage/too-light'],
		])
		assert.deepEqual(contradictions(vocabulary, ['coverage/too-dark', 'gradient/should-be-flat']), [])
		assert.deepEqual(contradictions(vocabulary, []), [])
	})

	it('oppositeOf returns null for an unknown tag', () => {
		assert.equal(oppositeOf(vocabulary, 'not/a-tag'), null)
	})
})

describe('TAGS.md', () => {
	it('is up to date with vocabulary.json', () => {
		const result = buildTagsCli(['--check'])
		assert.equal(result.code, 0, result.err)
	})

	it('lists every tag, its opposite, its definition and its example', () => {
		const markdown = renderTagsMarkdown(vocabulary)
		for (const tag of vocabulary.tags) {
			assert.ok(markdown.includes(`\`${tag.id}\``), `TAGS.md must mention ${tag.id}`)
			assert.ok(markdown.includes(tag.definition), `TAGS.md must define ${tag.id}`)
			assert.ok(markdown.includes(tag.example), `TAGS.md must show an example for ${tag.id}`)
		}
	})
})
