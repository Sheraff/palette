/**
 * V3 tagging — the tag vocabulary and its symmetry linter.
 *
 * The reviewer's free text is the primary and only required channel (REVIEW_UI.md §4).
 * A tagging agent reads each comment afterwards and files *derived* note records
 * carrying tags from this vocabulary. The raw text stays authoritative; derived
 * records are droppable and rebuildable at any time.
 *
 * The binding rule is SYMMETRIC-VOCABULARY: **for every expressible complaint, its
 * opposite must exist.** v2-3's instrument could not record a gradient objection, so
 * all 14 gradient notes asked for *more* gradient and three arms were misdirected
 * (REVIEW_UI.md, prime directive). A one-way vocabulary reproduces that failure at the
 * index layer, so symmetry is enforced mechanically here rather than by review
 * discipline.
 *
 * Symmetry is defined as an involution on tag ids: every tag names exactly one
 * `opposite`, the opposite names it back, no tag is its own opposite, and both sit on
 * the same axis. `lintVocabulary` checks that and everything else the file must
 * satisfy; `assertVocabulary` throws. Nothing in this workstream reads the vocabulary
 * without linting it first — importing against a broken vocabulary would write tags
 * that can never be trusted.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Committed vocabulary file. Every function here takes the path as a parameter; this
 * is only the default.
 * [REVIEWED] — path fixed by the Phase 0 tagging workstream brief
 * (`research/v3/data/tagging/`).
 */
export const DEFAULT_VOCABULARY_PATH = join(HERE, '..', '..', 'data', 'tagging', 'vocabulary.json')

/**
 * Tag id shape: `<axis>/<name>`, both lowercase kebab-case. Fixed so that a tag can be
 * grepped out of a warehouse line, sorted, and split on `/` to get its axis without a
 * lookup.
 * [UNCALIBRATED] — chosen here for greppability, matching the record-id prefix idea in
 * `warehouse/records.ts`.
 */
export const TAG_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

/**
 * The one tag the tagging agent may file about its own work rather than about the
 * palette: "this text is ambiguous, a human should check the mapping". It is a
 * vocabulary member (with an opposite) rather than a special field so that the
 * symmetry rule has no exemptions at all.
 * [REVIEWED] — TAGGING_PROTOCOL.md, ambiguity handling.
 */
export const AMBIGUITY_TAG = 'meta/tagger-unsure'

export interface AxisDef {
	id: string
	title: string
	about: string
}

export interface TagDef {
	id: string
	axis: string
	/** The tag that expresses the opposite complaint. Always present, always mutual. */
	opposite: string
	definition: string
	/** A phrase a reviewer might actually write that should map to this tag. */
	example: string
}

export interface Vocabulary {
	version: string
	updated: string
	rule: string
	epistemics: string
	axes: AxisDef[]
	tags: TagDef[]
}

export class TaggingError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'TaggingError'
	}
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function requireString(source: Record<string, unknown>, field: string, where: string): string {
	const value = source[field]
	if (typeof value !== 'string' || value.length === 0)
		throw new TaggingError(`${where}: field ${JSON.stringify(field)} must be a non-empty string`)
	return value
}

/** Parse and shape-check a vocabulary object. Does not lint — call `lintVocabulary` for that. */
export function parseVocabulary(value: unknown, where = 'vocabulary'): Vocabulary {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TaggingError(`${where}: expected an object`)
	const raw = value as Record<string, unknown>
	const version = requireString(raw, 'version', where)
	const updated = requireString(raw, 'updated', where)
	const rule = requireString(raw, 'rule', where)
	const epistemics = requireString(raw, 'epistemics', where)

	if (!Array.isArray(raw.axes)) throw new TaggingError(`${where}.axes: expected an array`)
	const axes: AxisDef[] = raw.axes.map((entry, i) => {
		if (!entry || typeof entry !== 'object') throw new TaggingError(`${where}.axes[${i}]: expected an object`)
		const axis = entry as Record<string, unknown>
		return {
			id: requireString(axis, 'id', `${where}.axes[${i}]`),
			title: requireString(axis, 'title', `${where}.axes[${i}]`),
			about: requireString(axis, 'about', `${where}.axes[${i}]`),
		}
	})

	if (!Array.isArray(raw.tags)) throw new TaggingError(`${where}.tags: expected an array`)
	const tags: TagDef[] = raw.tags.map((entry, i) => {
		if (!entry || typeof entry !== 'object') throw new TaggingError(`${where}.tags[${i}]: expected an object`)
		const tag = entry as Record<string, unknown>
		return {
			id: requireString(tag, 'id', `${where}.tags[${i}]`),
			axis: requireString(tag, 'axis', `${where}.tags[${i}]`),
			opposite: requireString(tag, 'opposite', `${where}.tags[${i}]`),
			definition: requireString(tag, 'definition', `${where}.tags[${i}]`),
			example: requireString(tag, 'example', `${where}.tags[${i}]`),
		}
	})

	return { version, updated, rule, epistemics, axes, tags }
}

/**
 * Read, parse and lint the vocabulary. Throws on any lint issue — a caller that gets a
 * `Vocabulary` back from this function knows it is symmetric.
 */
export function loadVocabulary(file: string = DEFAULT_VOCABULARY_PATH): Vocabulary {
	let text: string
	try {
		text = readFileSync(file, 'utf8')
	} catch (error) {
		throw new TaggingError(`cannot read vocabulary ${file}: ${(error as Error).message}`)
	}
	let parsed: unknown
	try {
		parsed = JSON.parse(text)
	} catch (error) {
		throw new TaggingError(`vocabulary ${file} is not JSON: ${(error as Error).message}`)
	}
	const vocabulary = parseVocabulary(parsed, file)
	assertVocabulary(vocabulary)
	return vocabulary
}

// ---------------------------------------------------------------------------
// The linter
// ---------------------------------------------------------------------------

export interface LintIssue {
	/** `symmetry` issues are the binding rule; the rest are hygiene. */
	kind: 'symmetry' | 'shape' | 'axis' | 'duplicate' | 'text'
	tag: string | null
	message: string
}

/**
 * Check every rule the vocabulary file must satisfy. Returns the issues; empty means
 * the vocabulary is well-formed and symmetric.
 *
 * Rules, in order:
 *  1. axis ids unique and non-empty
 *  2. tag ids unique and shaped `<axis>/<name>`
 *  3. every tag's `axis` is a declared axis, and matches the id's prefix
 *  4. SYMMETRY: `opposite` names an existing tag, on the same axis, that is not the tag
 *     itself, and that names this tag back (involution)
 *  5. every axis has at least one tag, and an even number of them (pairs partition it)
 *  6. definitions and examples are present, distinct per tag, and not duplicated
 */
export function lintVocabulary(vocabulary: Vocabulary): LintIssue[] {
	const issues: LintIssue[] = []
	const add = (kind: LintIssue['kind'], tag: string | null, message: string) => issues.push({ kind, tag, message })

	// 1. axes
	const axisIds = new Set<string>()
	for (const axis of vocabulary.axes) {
		if (axisIds.has(axis.id)) add('duplicate', null, `axis ${JSON.stringify(axis.id)} is declared more than once`)
		axisIds.add(axis.id)
	}

	// 2 + 3. tag ids and axis membership
	const byId = new Map<string, TagDef>()
	for (const tag of vocabulary.tags) {
		if (byId.has(tag.id)) add('duplicate', tag.id, `tag ${JSON.stringify(tag.id)} is declared more than once`)
		byId.set(tag.id, tag)
		if (!TAG_ID_PATTERN.test(tag.id)) add('shape', tag.id, `tag id must look like "<axis>/<name>" in kebab-case`)
		if (!axisIds.has(tag.axis)) add('axis', tag.id, `axis ${JSON.stringify(tag.axis)} is not declared in "axes"`)
		const prefix = tag.id.split('/')[0]
		if (prefix !== tag.axis) add('axis', tag.id, `tag id prefix ${JSON.stringify(prefix)} does not match axis ${JSON.stringify(tag.axis)}`)
	}

	// 4. symmetry — the binding rule
	for (const tag of vocabulary.tags) {
		if (tag.opposite === tag.id) {
			add('symmetry', tag.id, 'a tag may not be its own opposite — an opposite that is the tag itself expresses nothing')
			continue
		}
		const other = byId.get(tag.opposite)
		if (!other) {
			add('symmetry', tag.id, `opposite ${JSON.stringify(tag.opposite)} does not exist — every expressible complaint needs its opposite`)
			continue
		}
		if (other.opposite !== tag.id)
			add(
				'symmetry',
				tag.id,
				`opposite is not mutual: ${JSON.stringify(tag.id)} → ${JSON.stringify(tag.opposite)} → ${JSON.stringify(other.opposite)}`,
			)
		if (other.axis !== tag.axis)
			add('symmetry', tag.id, `opposite ${JSON.stringify(tag.opposite)} sits on axis ${JSON.stringify(other.axis)}, not ${JSON.stringify(tag.axis)}`)
	}

	// 5. every axis is populated, in pairs
	const perAxis = new Map<string, number>()
	for (const tag of vocabulary.tags) perAxis.set(tag.axis, (perAxis.get(tag.axis) ?? 0) + 1)
	for (const axis of vocabulary.axes) {
		const count = perAxis.get(axis.id) ?? 0
		if (count === 0) add('axis', null, `axis ${JSON.stringify(axis.id)} has no tags`)
		else if (count % 2 !== 0)
			add('symmetry', null, `axis ${JSON.stringify(axis.id)} has ${count} tags — an odd count cannot be a set of pairs`)
	}

	// 6. text hygiene
	const definitions = new Map<string, string>()
	const examples = new Map<string, string>()
	for (const tag of vocabulary.tags) {
		const definitionOwner = definitions.get(tag.definition)
		if (definitionOwner) add('text', tag.id, `definition is identical to ${JSON.stringify(definitionOwner)}`)
		else definitions.set(tag.definition, tag.id)
		const exampleOwner = examples.get(tag.example)
		if (exampleOwner) add('text', tag.id, `example phrase is identical to ${JSON.stringify(exampleOwner)}`)
		else examples.set(tag.example, tag.id)
	}

	return issues
}

/** Throw a single readable error listing every lint issue. No-op on a clean vocabulary. */
export function assertVocabulary(vocabulary: Vocabulary): void {
	const issues = lintVocabulary(vocabulary)
	if (!issues.length) return
	const lines = issues.map((issue) => `  [${issue.kind}] ${issue.tag ?? '-'}: ${issue.message}`)
	throw new TaggingError(`vocabulary failed ${issues.length} check(s):\n${lines.join('\n')}`)
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Every tag id, in file order. */
export function tagIds(vocabulary: Vocabulary): string[] {
	return vocabulary.tags.map((tag) => tag.id)
}

/** Tag definition by id, or null. */
export function tagById(vocabulary: Vocabulary, id: string): TagDef | null {
	return vocabulary.tags.find((tag) => tag.id === id) ?? null
}

/** The opposite of a tag, or null when the tag is unknown. */
export function oppositeOf(vocabulary: Vocabulary, id: string): string | null {
	return tagById(vocabulary, id)?.opposite ?? null
}

/** Tags of one axis, in file order. */
export function tagsOfAxis(vocabulary: Vocabulary, axisId: string): TagDef[] {
	return vocabulary.tags.filter((tag) => tag.axis === axisId)
}

/**
 * The `[a, b]` pairs of an axis, each listed once, in first-seen order. Only defined
 * on a linted vocabulary — call `assertVocabulary` first.
 */
export function tagPairs(vocabulary: Vocabulary): Array<[string, string]> {
	const seen = new Set<string>()
	const pairs: Array<[string, string]> = []
	for (const tag of vocabulary.tags) {
		if (seen.has(tag.id)) continue
		seen.add(tag.id)
		seen.add(tag.opposite)
		pairs.push([tag.id, tag.opposite])
	}
	return pairs
}

/** Tag ids that are not in the vocabulary, in input order, deduplicated. */
export function unknownTags(vocabulary: Vocabulary, tags: readonly string[]): string[] {
	const known = new Set(tagIds(vocabulary))
	const out: string[] = []
	for (const tag of tags) if (!known.has(tag) && !out.includes(tag)) out.push(tag)
	return out
}

/**
 * Pairs of opposites present in the same tag list.
 *
 * A single comment carrying both a complaint and its opposite is almost always a
 * mis-mapping ("too dark" and "too light" about one palette). Symmetry is what makes
 * this check possible at all — it falls straight out of the rule.
 */
export function contradictions(vocabulary: Vocabulary, tags: readonly string[]): Array<[string, string]> {
	const present = new Set(tags)
	const found: Array<[string, string]> = []
	for (const tag of tags) {
		const opposite = oppositeOf(vocabulary, tag)
		if (!opposite || !present.has(opposite)) continue
		const pair: [string, string] = tag < opposite ? [tag, opposite] : [opposite, tag]
		if (!found.some(([a, b]) => a === pair[0] && b === pair[1])) found.push(pair)
	}
	return found
}
