/**
 * V3 tagging — vocabulary, symmetry linter, and the v2 symmetry-scoping law.
 * Run: NODE_NO_WARNINGS=1 node --experimental-strip-types --test research/v3/tests/tagging-*.test.ts
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
	AMBIGUITY_TAG,
	assertVocabulary,
	axisById,
	AXIS_KINDS,
	contradictions,
	counterpartsOf,
	DEFAULT_VOCABULARY_PATH,
	kindOf,
	lintVocabulary,
	loadVocabulary,
	oppositeOf,
	parseVocabulary,
	scopeCounts,
	scopeOf,
	SCOPES,
	tagById,
	tagIds,
	tagPairs,
	tagsOfAxis,
	tagsOfKind,
	TaggingError,
	unknownTags,
	VALENCES,
	type AxisKind,
	type Scope,
	type TagDef,
	type Valence,
	type Vocabulary,
} from '../src/tagging/vocabulary.ts'
import { renderTagsMarkdown, runCli as buildTagsCli } from '../src/tagging/build-tags-md.ts'

const vocabulary = loadVocabulary(DEFAULT_VOCABULARY_PATH)

/** A judgment tag, spelled out so the toy vocabularies stay readable. */
function judgment(id: string, opposite: string, axis: string, definition: string, example: string): TagDef {
	return { id, axis, opposite, counterparts: [], valence: null, scope: null, definition, example }
}

/** A descriptive tag: no opposite, one or more counterparts, a valence. */
function descriptive(id: string, axis: string, counterparts: string[], valence: Valence, definition: string, example: string): TagDef {
	return { id, axis, opposite: null, counterparts, valence, scope: null, definition, example }
}

/** A minimal, well-formed vocabulary the negative tests mutate. */
function toy(): Vocabulary {
	return {
		version: '0.0.1',
		updated: '2026-08-03',
		rule: 'toy',
		symmetryScoping: 'toy scoping',
		epistemics: 'toy',
		scopes: SCOPES.map((id) => ({ id, about: `about ${id}` })),
		axes: [{ id: 'x', title: 'X', kind: 'judgment', scope: 'pairwise-item', about: 'about x' }],
		tags: [judgment('x/up', 'x/down', 'x', 'goes up', 'it is too low'), judgment('x/down', 'x/up', 'x', 'goes down', 'it is too high')],
	}
}

/** `toy()` plus a well-formed descriptive axis — the shape the v2 exemption allows. */
function toyWithDescriptive(): Vocabulary {
	const v = toy()
	v.axes.push({ id: 'obs', title: 'Obs', kind: 'descriptive', scope: 'instrument', about: 'about obs' })
	v.tags.push(
		descriptive('obs/good', 'obs', ['obs/bad'], 'positive', 'it did the hoped-for thing', 'it handled the odd one'),
		descriptive('obs/bad', 'obs', ['obs/good'], 'negative', 'it did the unwanted thing', 'it missed the easy one'),
		descriptive('obs/other', 'obs', ['obs/good'], 'neutral', 'it did a third legitimate thing', 'it keyed on the layout'),
	)
	// `obs/other` must be named by somebody, or surjectivity fails — this is the point of the rule.
	v.tags[2]!.counterparts.push('obs/other')
	return v
}

describe('committed vocabulary', () => {
	it('loads and passes every lint check', () => {
		assert.deepEqual(lintVocabulary(vocabulary), [])
	})

	it('is symmetric on every judgment axis: opposite exists, is mutual, is not the tag itself, shares its axis', () => {
		for (const tag of tagsOfKind(vocabulary, 'judgment')) {
			assert.ok(tag.opposite, `${tag.id}: a judgment tag must name an opposite`)
			const other = tagById(vocabulary, tag.opposite!)
			assert.ok(other, `${tag.id}: opposite ${tag.opposite} must exist`)
			assert.notEqual(tag.opposite, tag.id, `${tag.id}: must not be its own opposite`)
			assert.equal(other!.opposite, tag.id, `${tag.id}: opposite must be mutual`)
			assert.equal(other!.axis, tag.axis, `${tag.id}: opposite must share the axis`)
		}
	})

	it('partitions every judgment axis into pairs, two tags per pair, every judgment tag used once', () => {
		const pairs = tagPairs(vocabulary)
		const judgmentTags = tagsOfKind(vocabulary, 'judgment')
		assert.equal(pairs.length * 2, judgmentTags.length)
		const flat = pairs.flat()
		assert.equal(new Set(flat).size, judgmentTags.length)
		assert.deepEqual(
			[...flat].sort(),
			judgmentTags.map((tag) => tag.id).sort(),
		)
	})

	it('covers the v1 axes and the four v2 axes, each with a declared kind and scope', () => {
		const expected = [
			'gradient',
			'coverage',
			'role',
			'contrast',
			'collapse',
			'identity',
			'provenance',
			'meta',
			// v2 — the four classes the v1 smoke pass could not express
			'instrument-behavior',
			'instrument-fitness',
			'concept',
			'criterion',
		]
		assert.deepEqual(
			vocabulary.axes.map((axis) => axis.id),
			expected,
		)
		for (const axis of vocabulary.axes) {
			assert.ok((AXIS_KINDS as readonly string[]).includes(axis.kind), `${axis.id}: ${axis.kind} is not an axis kind`)
			assert.ok((SCOPES as readonly string[]).includes(axis.scope), `${axis.id}: ${axis.scope} is not a scope`)
			assert.ok(tagsOfAxis(vocabulary, axis.id).length >= 2, `${axis.id} needs at least two tags`)
		}
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

describe('the v2 symmetry scoping — the committed file', () => {
	it('states the judgment/descriptive law in the vocabulary file itself, not only in prose elsewhere', () => {
		assert.match(vocabulary.symmetryScoping, /judgment/)
		assert.match(vocabulary.symmetryScoping, /descriptive/)
		assert.match(vocabulary.symmetryScoping, /counterpart/)
		assert.match(vocabulary.symmetryScoping, /valence/)
	})

	it('keeps every complaint on a judgment axis: descriptive tags exist only for instrument behaviour', () => {
		const descriptiveAxes = vocabulary.axes.filter((axis) => axis.kind === 'descriptive').map((axis) => axis.id)
		assert.deepEqual(descriptiveAxes, ['instrument-behavior'])
		// The three other v2 classes are complaints, so they took the full symmetry law.
		for (const axis of ['instrument-fitness', 'concept', 'criterion'])
			assert.equal(axisById(vocabulary, axis)!.kind, 'judgment', `${axis} must stay symmetric`)
	})

	it('never mixes the two field sets: opposite is judgment-only, counterparts and valence descriptive-only', () => {
		for (const tag of vocabulary.tags) {
			const kind = kindOf(vocabulary, tag.id)
			if (kind === 'judgment') {
				assert.ok(tag.opposite, `${tag.id}: judgment tags name an opposite`)
				assert.equal(tag.counterparts.length, 0, `${tag.id}: judgment tags carry no counterparts`)
				assert.equal(tag.valence, null, `${tag.id}: judgment tags carry no valence`)
			} else {
				assert.equal(tag.opposite, null, `${tag.id}: descriptive tags have no opposite`)
				assert.ok(tag.counterparts.length > 0, `${tag.id}: descriptive tags name an alternative`)
				assert.ok((VALENCES as readonly string[]).includes(tag.valence ?? ''), `${tag.id}: descriptive tags carry a valence`)
			}
		}
	})

	it('descriptive axes are total and surjective under counterparts — the alternative is expressible both ways', () => {
		const named = new Set(vocabulary.tags.flatMap((tag) => tag.counterparts))
		for (const tag of tagsOfKind(vocabulary, 'descriptive')) {
			assert.ok(named.has(tag.id), `${tag.id}: nothing names it as a counterpart — one-way recording`)
			for (const counterpart of tag.counterparts) {
				assert.notEqual(counterpart, tag.id)
				assert.equal(tagById(vocabulary, counterpart)!.axis, tag.axis)
			}
		}
	})

	it('every descriptive axis can record both a good and a bad surprise', () => {
		for (const axis of vocabulary.axes.filter((entry) => entry.kind === 'descriptive')) {
			const valences = new Set(tagsOfAxis(vocabulary, axis.id).map((tag) => tag.valence))
			assert.ok(valences.has('positive'), `${axis.id} must be able to record a positive observation`)
			assert.ok(valences.has('negative'), `${axis.id} must be able to record a negative one`)
		}
	})

	it('exercises the parity exemption: a descriptive axis may hold an odd number of tags', () => {
		const behavior = tagsOfAxis(vocabulary, 'instrument-behavior')
		assert.equal(behavior.length % 2, 1, 'the committed file relies on the exemption, so it stays tested')
		assert.deepEqual(lintVocabulary(vocabulary), [])
	})

	it('the contradiction check fires on judgment tags only — two observations are not a conflict', () => {
		assert.deepEqual(
			contradictions(vocabulary, ['instrument-behavior/attends-to-appearance', 'instrument-behavior/attends-to-semantics']),
			[],
		)
		assert.deepEqual(counterpartsOf(vocabulary, 'instrument-behavior/attends-to-semantics'), [
			'instrument-behavior/attends-to-appearance',
		])
	})
})

describe('scope', () => {
	it('declares all four scopes, and gives every axis one of them', () => {
		assert.deepEqual(
			vocabulary.scopes.map((scope) => scope.id),
			[...SCOPES],
		)
		for (const axis of vocabulary.axes) assert.ok((SCOPES as readonly string[]).includes(axis.scope))
	})

	it('resolves the smoke pass question: meta is pairwise-item, artwork multi-validity is its own tag', () => {
		assert.equal(axisById(vocabulary, 'meta')!.scope, 'pairwise-item')
		assert.equal(scopeOf(vocabulary, 'meta/both-sides-good'), 'pairwise-item')
		// "both a flat and a gradient palette are defensible for THIS ARTWORK" is a different
		// claim with a different lifetime, so it is a different tag at a different scope.
		assert.equal(scopeOf(vocabulary, 'criterion/both-readings-defensible'), 'artwork')
		assert.equal(scopeOf(vocabulary, 'criterion/one-reading-only'), 'artwork')
		assert.equal(oppositeOf(vocabulary, 'criterion/both-readings-defensible'), 'criterion/one-reading-only')
	})

	it('lets a tag override its axis: the tagger tags are about an instrument, not about the pair', () => {
		assert.equal(scopeOf(vocabulary, AMBIGUITY_TAG), 'instrument')
		assert.equal(scopeOf(vocabulary, 'meta/tagger-confident'), 'instrument')
	})

	it('puts each v2 axis at the scope its class needs', () => {
		assert.equal(axisById(vocabulary, 'instrument-behavior')!.scope, 'instrument')
		assert.equal(axisById(vocabulary, 'instrument-fitness')!.scope, 'instrument')
		assert.equal(axisById(vocabulary, 'concept')!.scope, 'criterion')
		assert.equal(axisById(vocabulary, 'criterion')!.scope, 'criterion')
		for (const axis of ['gradient', 'coverage', 'role', 'contrast', 'collapse', 'identity', 'provenance'])
			assert.equal(axisById(vocabulary, axis)!.scope, 'pairwise-item')
	})

	it('scopeOf and scopeCounts answer for a tag list, and say so when a tag is unknown', () => {
		assert.equal(scopeOf(vocabulary, 'not/a-tag'), null)
		assert.deepEqual(scopeCounts(vocabulary, ['coverage/too-dark', 'criterion/both-readings-defensible', 'not/a-tag']), {
			'pairwise-item': 1,
			artwork: 1,
			unknown: 1,
		})
	})
})

describe('symmetry linter — negative cases on judgment axes', () => {
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

	it('rejects a judgment tag with no opposite at all — the exemption does not reach judgment axes', () => {
		const v = toy()
		v.tags[0]!.opposite = null
		const issues = lintVocabulary(v)
		assert.ok(issues.some((i) => i.kind === 'symmetry' && /must name an opposite/.test(i.message)))
	})

	it('rejects a one-way opposite — exactly the v2-3 instrument-bias shape', () => {
		const v = toy()
		v.tags.push(judgment('x/sideways', 'x/up', 'x', 'd3', 'e3'))
		v.tags.push(judgment('x/other', 'x/spare', 'x', 'd4', 'e4'))
		v.tags.push(judgment('x/spare', 'x/other', 'x', 'd5', 'e5'))
		const issues = lintVocabulary(v)
		assert.ok(issues.some((i) => i.kind === 'symmetry' && /not mutual/.test(i.message)))
	})

	it('rejects an opposite on a different axis', () => {
		const v = toy()
		v.axes.push({ id: 'y', title: 'Y', kind: 'judgment', scope: 'pairwise-item', about: 'about y' })
		v.tags.push(judgment('y/left', 'y/right', 'y', 'd3', 'e3'))
		v.tags.push(judgment('y/right', 'y/left', 'y', 'd4', 'e4'))
		v.tags[0]!.opposite = 'y/left'
		v.tags[2]!.opposite = 'x/up'
		const issues = lintVocabulary(v)
		assert.ok(issues.some((i) => i.kind === 'symmetry' && /sits on axis/.test(i.message)))
	})

	it('rejects a judgment axis with an odd number of tags', () => {
		const v = toy()
		v.tags.push(judgment('x/lonely', 'x/up', 'x', 'd3', 'e3'))
		const issues = lintVocabulary(v)
		assert.ok(issues.some((i) => i.kind === 'symmetry' && /cannot be a set of pairs/.test(i.message)))
	})

	it('rejects an undeclared axis, a mismatched id prefix, a bad id shape, and duplicates', () => {
		const v = toy()
		v.tags.push(judgment('z/Weird_Id', 'x/up', 'z', 'd3', 'e3'))
		v.tags.push(judgment('x/up', 'x/down', 'x', 'd4', 'e4'))
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

	it('assertVocabulary is a no-op on a clean vocabulary, with or without a descriptive axis', () => {
		assert.doesNotThrow(() => assertVocabulary(toy()))
		assert.doesNotThrow(() => assertVocabulary(toyWithDescriptive()))
	})

	it('loadVocabulary refuses a file that fails the linter', () => {
		assert.throws(() => loadVocabulary('/nonexistent/vocabulary.json'), TaggingError)
	})

	it('parseVocabulary rejects a malformed file before the linter ever sees it', () => {
		assert.throws(() => parseVocabulary({ version: '1' }), TaggingError)
		assert.throws(() => parseVocabulary(null), TaggingError)
		// A v1 file has no `symmetryScoping`, no `scopes`, and axes without `kind`: it must
		// fail loudly rather than be read as a v2 file with defaults.
		assert.throws(
			() =>
				parseVocabulary({
					version: '1.0.0',
					updated: '2026-08-03',
					rule: 'r',
					epistemics: 'e',
					axes: [{ id: 'x', title: 'X', about: 'a' }],
					tags: [],
				}),
			TaggingError,
		)
	})
})

describe('coverage linter — negative cases on descriptive axes', () => {
	it('rejects a descriptive tag that names an opposite — an observation has alternatives, not an opposite', () => {
		const v = toyWithDescriptive()
		v.tags[2]!.opposite = 'obs/bad'
		assert.ok(lintVocabulary(v).some((i) => i.kind === 'consistency' && /may not name an "opposite"/.test(i.message)))
	})

	it('rejects a judgment tag carrying counterparts or a valence — the exemption cannot leak sideways', () => {
		const v = toy()
		v.tags[0]!.counterparts = ['x/down']
		v.tags[1]!.valence = 'neutral'
		const issues = lintVocabulary(v).filter((i) => i.kind === 'consistency')
		assert.equal(issues.length, 2)
		assert.ok(issues.some((i) => /may not carry "counterparts"/.test(i.message)))
		assert.ok(issues.some((i) => /may not carry "valence"/.test(i.message)))
	})

	it('rejects a descriptive tag with no counterpart at all', () => {
		const v = toyWithDescriptive()
		v.tags[4]!.counterparts = []
		assert.ok(lintVocabulary(v).some((i) => i.kind === 'coverage' && /at least one counterpart/.test(i.message)))
	})

	it('rejects a descriptive tag with no valence, or an invented one', () => {
		const v = toyWithDescriptive()
		v.tags[2]!.valence = null
		v.tags[3]!.valence = 'interesting' as Valence
		const issues = lintVocabulary(v).filter((i) => i.kind === 'consistency')
		assert.equal(issues.length, 2)
	})

	it('rejects a self-counterpart, a dangling one, and one on another axis', () => {
		const v = toyWithDescriptive()
		v.tags[2]!.counterparts = ['obs/good']
		v.tags[3]!.counterparts = ['obs/nope']
		v.tags[4]!.counterparts = ['x/up']
		const issues = lintVocabulary(v).filter((i) => i.kind === 'coverage')
		assert.ok(issues.some((i) => /its own counterpart/.test(i.message)))
		assert.ok(issues.some((i) => /does not exist/.test(i.message)))
		assert.ok(issues.some((i) => /sits on axis/.test(i.message)))
	})

	it('rejects a dead-end observation nobody names — surjectivity is the anti-bias half of the law', () => {
		const v = toyWithDescriptive()
		// `obs/other` still names an alternative, but nothing names it any more: the
		// alternative reading has become expressible in one direction only.
		v.tags[2]!.counterparts = ['obs/bad']
		const issues = lintVocabulary(v).filter((i) => i.kind === 'coverage')
		assert.equal(issues.length, 1)
		assert.match(issues[0]!.message, /no tag names this one as a counterpart/)
		assert.equal(issues[0]!.tag, 'obs/other')
	})

	it('rejects a descriptive axis that can only record one sign', () => {
		const v = toyWithDescriptive()
		v.tags[2]!.valence = 'negative'
		const issues = lintVocabulary(v).filter((i) => i.kind === 'coverage')
		assert.ok(issues.some((i) => /has no positive tag/.test(i.message)))
	})

	it('rejects a descriptive axis with a single reading', () => {
		const v = toy()
		v.axes.push({ id: 'obs', title: 'Obs', kind: 'descriptive', scope: 'instrument', about: 'about obs' })
		v.tags.push(descriptive('obs/only', 'obs', ['obs/only'], 'neutral', 'the only thing', 'the only phrase'))
		const issues = lintVocabulary(v).filter((i) => i.kind === 'coverage')
		assert.ok(issues.some((i) => /records nothing/.test(i.message)))
	})

	it('accepts an odd descriptive axis — parity is a judgment-axis rule only', () => {
		const v = toyWithDescriptive()
		assert.equal(tagsOfAxis(v, 'obs').length % 2, 1)
		assert.deepEqual(lintVocabulary(v), [])
	})
})

describe('scope and axis-kind linting', () => {
	it('rejects an axis with an unknown kind', () => {
		const v = toy()
		v.axes[0]!.kind = 'vibes' as AxisKind
		assert.ok(lintVocabulary(v).some((i) => i.kind === 'axis' && /has kind/.test(i.message)))
	})

	it('rejects an axis scope and a tag scope override that are not declared scopes', () => {
		const v = toy()
		v.axes[0]!.scope = 'galaxy' as Scope
		v.tags[0]!.scope = 'elsewhere' as Scope
		const issues = lintVocabulary(v).filter((i) => i.kind === 'scope')
		assert.equal(issues.length, 2)
	})

	it('rejects a vocabulary that drops one of the four scopes', () => {
		const v = toy()
		v.scopes = v.scopes.filter((scope) => scope.id !== 'criterion')
		assert.ok(lintVocabulary(v).some((i) => i.kind === 'scope' && /is not declared in "scopes"/.test(i.message)))
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

	it('oppositeOf, counterpartsOf and kindOf return null/empty for an unknown tag', () => {
		assert.equal(oppositeOf(vocabulary, 'not/a-tag'), null)
		assert.deepEqual(counterpartsOf(vocabulary, 'not/a-tag'), [])
		assert.equal(kindOf(vocabulary, 'not/a-tag'), null)
		assert.equal(kindOf(vocabulary, 'coverage/too-dark'), 'judgment')
		assert.equal(kindOf(vocabulary, 'instrument-behavior/instruments-differ'), 'descriptive')
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

	it('shows the scoping law, the scope table, and each axis kind — the tagger reads this file, not the JSON', () => {
		const markdown = renderTagsMarkdown(vocabulary)
		assert.ok(markdown.includes(vocabulary.symmetryScoping))
		for (const scope of vocabulary.scopes) assert.ok(markdown.includes(scope.about), `TAGS.md must explain scope ${scope.id}`)
		for (const axis of vocabulary.axes) assert.ok(markdown.includes(`**Kind:** ${axis.kind}`))
		// descriptive tags are rendered with their alternatives and valence, not as pairs
		assert.ok(markdown.includes('| tag | valence | alternatives | means | example phrase |'))
	})
})
