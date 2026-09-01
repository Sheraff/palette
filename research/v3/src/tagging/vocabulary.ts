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
 * ---------------------------------------------------------------------------
 * v2.0.0 — the symmetry rule gets a scope instead of exceptions
 * ---------------------------------------------------------------------------
 *
 * The v1 smoke pass mapped 13 reviewer observations to **zero** tags: every one of them
 * was about an instrument (an embedding model, a segmenter, the review rendering) or
 * about a criterion, and the whole vocabulary was about published palettes. Two of those
 * classes cannot be forced into an involution without lying:
 *
 *   "DINOv2 focused on the layout, DINOv3 on the typography"
 *
 * has no opposite. It is not a complaint; it is a description of what an instrument did.
 * Demanding an opposite for it would produce an invented tag nobody would ever file,
 * which is a worse instrument defect than the gap it patches.
 *
 * So each axis declares a **kind**, and the linter enforces a different law per kind:
 *
 *   judgment   — the tag asserts something should have been otherwise. SYMMETRY applies
 *                unchanged: `opposite` is required, and the relation must be an
 *                involution within the axis (exists, mutual, not self, same axis), and
 *                the axis must hold an even number of tags. **Every complaint the
 *                reviewer can express about a palette, an instrument, a label or a
 *                criterion lives on a judgment axis.** This is where the v2-3 bias
 *                failure lives, and nothing here is relaxed.
 *
 *   descriptive — the tag records what an instrument was observed to do, with no claim
 *                that it should have done otherwise. `opposite` must be null. Instead:
 *                  * `counterparts` — the observation(s) you would have filed had the
 *                    instrument done the other thing. Must be non-empty, on the same
 *                    axis, never the tag itself.
 *                  * every descriptive tag must itself be named as somebody's
 *                    counterpart (**surjectivity**): if a reading is expressible, the
 *                    alternative to it must be expressible too, in both directions.
 *                  * `valence` — positive / neutral / negative, and each descriptive
 *                    axis must carry at least one positive and at least one negative
 *                    tag. This is the anti-bias check: an axis that can only record an
 *                    instrument misbehaving is exactly the one-way instrument the
 *                    symmetry rule exists to prevent, wearing different clothes.
 *
 * Stated in one line: an involution is a total, surjective, self-inverse map on a set of
 * tags. Descriptive axes keep totality and surjectivity and drop only self-inversion
 * (and with it injectivity — a counterpart may serve several tags). That is the whole
 * exemption, and it is checked, not trusted.
 *
 * Scope is the other v2 addition. Every axis declares one of
 * `pairwise-item | artwork | instrument | criterion`, and a tag may override its axis's
 * value. Scope says what the statement is *about*, which is what makes
 * "both palettes in this pair are fine" (pairwise-item) a different claim from
 * "both a flat and a gradient palette are defensible for this artwork" (artwork) — a
 * distinction v1 could not draw, and the reason the smoke pass had to flag an entry
 * unsure.
 *
 * Symmetry is defined as an involution on tag ids: every judgment tag names exactly one
 * `opposite`, the opposite names it back, no tag is its own opposite, and both sit on
 * the same axis. `lintVocabulary` checks that and everything else the file must satisfy;
 * `assertVocabulary` throws. Nothing in this workstream reads the vocabulary without
 * linting it first — importing against a broken vocabulary would write tags that can
 * never be trusted.
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

/**
 * What a statement is about. Declared per axis, overridable per tag.
 *
 *  - `pairwise-item` — one review item: the pair that was shown, or either palette in
 *    it. Meaningless away from that item.
 *  - `artwork` — this artwork, and any palette that could be derived from it.
 *  - `instrument` — a tool we judge with or judge through: an embedding model, a
 *    segmenter, the VLM oracle, the review rendering, the tagging agent itself.
 *  - `criterion` — the definitions, labels and tests by which judgments are made. Binds
 *    no artwork and no instrument run.
 *
 * [REVIEWED] — the four scopes named in the v2 vocabulary brief.
 */
export const SCOPES = ['pairwise-item', 'artwork', 'instrument', 'criterion'] as const
export type Scope = (typeof SCOPES)[number]

/**
 * Axis kinds. `judgment` axes assert something should have been otherwise and carry the
 * full symmetry law; `descriptive` axes record observed behaviour and carry the
 * coverage law instead. See the module header for why the split exists.
 * [REVIEWED] — the v2 symmetry-scoping decision.
 */
export const AXIS_KINDS = ['judgment', 'descriptive'] as const
export type AxisKind = (typeof AXIS_KINDS)[number]

/**
 * Sign of a descriptive observation *for our purposes* — deliberately coarse. It is not
 * a quality score: `negative` means "the instrument did something we did not ask for",
 * `positive` means "it did the thing we hoped for on a case where it might not have",
 * `neutral` means "it did one of several equally legitimate things".
 * [REVIEWED] — introduced with the descriptive axes so the coverage check has something
 * to count.
 */
export const VALENCES = ['positive', 'neutral', 'negative'] as const
export type Valence = (typeof VALENCES)[number]

export interface AxisDef {
	id: string
	title: string
	/** `judgment` → symmetry law; `descriptive` → coverage law. */
	kind: AxisKind
	/** Default scope for this axis's tags. */
	scope: Scope
	about: string
}

export interface TagDef {
	id: string
	axis: string
	/** Judgment tags: the tag expressing the opposite complaint, always mutual. Descriptive tags: null. */
	opposite: string | null
	/** Descriptive tags: the observation(s) filed instead had the instrument done otherwise. Judgment tags: empty. */
	counterparts: string[]
	/** Descriptive tags only. */
	valence: Valence | null
	/** Overrides the axis scope when present. */
	scope: Scope | null
	definition: string
	/** A phrase a reviewer might actually write that should map to this tag. */
	example: string
}

export interface ScopeDef {
	id: Scope
	about: string
}

export interface Vocabulary {
	version: string
	updated: string
	rule: string
	/** The judgment/descriptive rule, in the file so the schema states its own law. */
	symmetryScoping: string
	epistemics: string
	scopes: ScopeDef[]
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

function optionalString(source: Record<string, unknown>, field: string, where: string): string | null {
	const value = source[field]
	if (value === undefined || value === null) return null
	if (typeof value !== 'string' || value.length === 0)
		throw new TaggingError(`${where}: field ${JSON.stringify(field)} must be a non-empty string or null`)
	return value
}

function stringArray(source: Record<string, unknown>, field: string, where: string): string[] {
	const value = source[field]
	if (value === undefined || value === null) return []
	if (!Array.isArray(value)) throw new TaggingError(`${where}: field ${JSON.stringify(field)} must be an array of tag ids`)
	return value.map((entry, i) => {
		if (typeof entry !== 'string' || entry.length === 0)
			throw new TaggingError(`${where}.${field}[${i}]: expected a non-empty tag id`)
		return entry
	})
}

/**
 * Parse and shape-check a vocabulary object. Does not lint — call `lintVocabulary` for
 * that. Unknown enum values (a bad `kind`, `scope` or `valence`) survive parsing as
 * strings so the linter can report them by name rather than the parser throwing on the
 * first one.
 */
export function parseVocabulary(value: unknown, where = 'vocabulary'): Vocabulary {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TaggingError(`${where}: expected an object`)
	const raw = value as Record<string, unknown>
	const version = requireString(raw, 'version', where)
	const updated = requireString(raw, 'updated', where)
	const rule = requireString(raw, 'rule', where)
	const symmetryScoping = requireString(raw, 'symmetryScoping', where)
	const epistemics = requireString(raw, 'epistemics', where)

	if (!Array.isArray(raw.scopes)) throw new TaggingError(`${where}.scopes: expected an array`)
	const scopes: ScopeDef[] = raw.scopes.map((entry, i) => {
		if (!entry || typeof entry !== 'object') throw new TaggingError(`${where}.scopes[${i}]: expected an object`)
		const scope = entry as Record<string, unknown>
		return {
			id: requireString(scope, 'id', `${where}.scopes[${i}]`) as Scope,
			about: requireString(scope, 'about', `${where}.scopes[${i}]`),
		}
	})

	if (!Array.isArray(raw.axes)) throw new TaggingError(`${where}.axes: expected an array`)
	const axes: AxisDef[] = raw.axes.map((entry, i) => {
		if (!entry || typeof entry !== 'object') throw new TaggingError(`${where}.axes[${i}]: expected an object`)
		const axis = entry as Record<string, unknown>
		return {
			id: requireString(axis, 'id', `${where}.axes[${i}]`),
			title: requireString(axis, 'title', `${where}.axes[${i}]`),
			kind: requireString(axis, 'kind', `${where}.axes[${i}]`) as AxisKind,
			scope: requireString(axis, 'scope', `${where}.axes[${i}]`) as Scope,
			about: requireString(axis, 'about', `${where}.axes[${i}]`),
		}
	})

	if (!Array.isArray(raw.tags)) throw new TaggingError(`${where}.tags: expected an array`)
	const tags: TagDef[] = raw.tags.map((entry, i) => {
		if (!entry || typeof entry !== 'object') throw new TaggingError(`${where}.tags[${i}]: expected an object`)
		const tag = entry as Record<string, unknown>
		const at = `${where}.tags[${i}]`
		return {
			id: requireString(tag, 'id', at),
			axis: requireString(tag, 'axis', at),
			opposite: optionalString(tag, 'opposite', at),
			counterparts: stringArray(tag, 'counterparts', at),
			valence: optionalString(tag, 'valence', at) as Valence | null,
			scope: optionalString(tag, 'scope', at) as Scope | null,
			definition: requireString(tag, 'definition', at),
			example: requireString(tag, 'example', at),
		}
	})

	return { version, updated, rule, symmetryScoping, epistemics, scopes, axes, tags }
}

/**
 * Read, parse and lint the vocabulary. Throws on any lint issue — a caller that gets a
 * `Vocabulary` back from this function knows its judgment axes are symmetric and its
 * descriptive axes are covered.
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
	/**
	 * `symmetry` is the binding rule on judgment axes; `coverage` is its counterpart law
	 * on descriptive axes. `consistency` catches a field used on the wrong axis kind.
	 * The rest are hygiene.
	 */
	kind: 'symmetry' | 'coverage' | 'consistency' | 'scope' | 'shape' | 'axis' | 'duplicate' | 'text'
	tag: string | null
	message: string
}

/**
 * Check every rule the vocabulary file must satisfy. Returns the issues; empty means
 * the vocabulary is well-formed, symmetric where it claims to judge, and covered where
 * it claims to describe.
 *
 * Rules, in order:
 *  1. scope ids are the declared set; axis ids unique, non-empty, of a known kind, with
 *     a declared scope
 *  2. tag ids unique and shaped `<axis>/<name>`; a tag-level scope override is a
 *     declared scope
 *  3. every tag's `axis` is a declared axis, and matches the id's prefix
 *  4. field/kind consistency: judgment tags carry `opposite` and neither `counterparts`
 *     nor `valence`; descriptive tags carry `counterparts` and `valence` and no
 *     `opposite`
 *  5. SYMMETRY (judgment axes): `opposite` names an existing tag, on the same axis, that
 *     is not the tag itself, and that names this tag back (involution); the axis holds
 *     an even number of tags
 *  6. COVERAGE (descriptive axes): every `counterparts` entry exists, sits on the same
 *     axis and is not the tag itself (totality); every descriptive tag is named as some
 *     other tag's counterpart (surjectivity); the axis carries at least one `positive`
 *     and at least one `negative` tag, and at least two tags in total
 *  7. every axis has at least one tag
 *  8. definitions and examples are present, distinct per tag, and not duplicated
 */
export function lintVocabulary(vocabulary: Vocabulary): LintIssue[] {
	const issues: LintIssue[] = []
	const add = (kind: LintIssue['kind'], tag: string | null, message: string) => issues.push({ kind, tag, message })

	// 1. scopes and axes
	const declaredScopes = new Set<string>(vocabulary.scopes.map((scope) => scope.id))
	for (const scope of vocabulary.scopes)
		if (!(SCOPES as readonly string[]).includes(scope.id))
			add('scope', null, `scope ${JSON.stringify(scope.id)} is not one of ${SCOPES.join(', ')}`)
	for (const scope of SCOPES) if (!declaredScopes.has(scope)) add('scope', null, `scope ${JSON.stringify(scope)} is not declared in "scopes"`)

	const axisIds = new Set<string>()
	const axisById = new Map<string, AxisDef>()
	for (const axis of vocabulary.axes) {
		if (axisIds.has(axis.id)) add('duplicate', null, `axis ${JSON.stringify(axis.id)} is declared more than once`)
		axisIds.add(axis.id)
		axisById.set(axis.id, axis)
		if (!(AXIS_KINDS as readonly string[]).includes(axis.kind))
			add('axis', null, `axis ${JSON.stringify(axis.id)} has kind ${JSON.stringify(axis.kind)}, expected one of ${AXIS_KINDS.join(', ')}`)
		if (!declaredScopes.has(axis.scope))
			add('scope', null, `axis ${JSON.stringify(axis.id)} has scope ${JSON.stringify(axis.scope)}, which is not a declared scope`)
	}

	// 2 + 3. tag ids, axis membership, scope overrides
	const byId = new Map<string, TagDef>()
	for (const tag of vocabulary.tags) {
		if (byId.has(tag.id)) add('duplicate', tag.id, `tag ${JSON.stringify(tag.id)} is declared more than once`)
		byId.set(tag.id, tag)
		if (!TAG_ID_PATTERN.test(tag.id)) add('shape', tag.id, `tag id must look like "<axis>/<name>" in kebab-case`)
		if (!axisIds.has(tag.axis)) add('axis', tag.id, `axis ${JSON.stringify(tag.axis)} is not declared in "axes"`)
		const prefix = tag.id.split('/')[0]
		if (prefix !== tag.axis) add('axis', tag.id, `tag id prefix ${JSON.stringify(prefix)} does not match axis ${JSON.stringify(tag.axis)}`)
		if (tag.scope !== null && !declaredScopes.has(tag.scope))
			add('scope', tag.id, `scope override ${JSON.stringify(tag.scope)} is not a declared scope`)
	}

	// 4 + 5 + 6. the law, per axis kind
	const namedAsCounterpart = new Set<string>()
	for (const tag of vocabulary.tags) for (const counterpart of tag.counterparts) namedAsCounterpart.add(counterpart)

	for (const tag of vocabulary.tags) {
		const axis = axisById.get(tag.axis)
		// An unknown axis was already reported; without a kind there is no law to apply.
		if (!axis || !(AXIS_KINDS as readonly string[]).includes(axis.kind)) continue

		if (axis.kind === 'judgment') {
			if (tag.counterparts.length)
				add('consistency', tag.id, 'a judgment tag may not carry "counterparts" — its opposite is the whole relation')
			if (tag.valence !== null) add('consistency', tag.id, 'a judgment tag may not carry "valence" — every judgment tag is a complaint')
			if (tag.opposite === null) {
				add('symmetry', tag.id, 'a judgment tag must name an opposite — a complaint with no opposite is a one-way instrument')
				continue
			}
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
			continue
		}

		// descriptive
		if (tag.opposite !== null)
			add('consistency', tag.id, 'a descriptive tag may not name an "opposite" — an observation has alternatives, not an opposite')
		if (tag.valence === null || !(VALENCES as readonly string[]).includes(tag.valence))
			add('consistency', tag.id, `a descriptive tag must declare a valence, one of ${VALENCES.join(', ')} — got ${JSON.stringify(tag.valence)}`)
		if (!tag.counterparts.length) {
			add('coverage', tag.id, 'a descriptive tag must name at least one counterpart — the observation filed had the instrument done otherwise')
		}
		for (const counterpart of tag.counterparts) {
			if (counterpart === tag.id) {
				add('coverage', tag.id, 'a tag may not be its own counterpart — it names no alternative reading')
				continue
			}
			const other = byId.get(counterpart)
			if (!other) {
				add('coverage', tag.id, `counterpart ${JSON.stringify(counterpart)} does not exist`)
				continue
			}
			if (other.axis !== tag.axis)
				add('coverage', tag.id, `counterpart ${JSON.stringify(counterpart)} sits on axis ${JSON.stringify(other.axis)}, not ${JSON.stringify(tag.axis)}`)
		}
		if (!namedAsCounterpart.has(tag.id))
			add(
				'coverage',
				tag.id,
				'no tag names this one as a counterpart — the alternative reading is expressible in one direction only, which is the bias the symmetry rule exists to prevent',
			)
	}

	// 7. axis population, and the per-kind axis-level laws
	const perAxis = new Map<string, TagDef[]>()
	for (const tag of vocabulary.tags) {
		const list = perAxis.get(tag.axis)
		if (list) list.push(tag)
		else perAxis.set(tag.axis, [tag])
	}
	for (const axis of vocabulary.axes) {
		const tags = perAxis.get(axis.id) ?? []
		if (tags.length === 0) {
			add('axis', null, `axis ${JSON.stringify(axis.id)} has no tags`)
			continue
		}
		if (axis.kind === 'judgment') {
			if (tags.length % 2 !== 0)
				add('symmetry', null, `axis ${JSON.stringify(axis.id)} has ${tags.length} tags — an odd count cannot be a set of pairs`)
			continue
		}
		if (axis.kind === 'descriptive') {
			if (tags.length < 2)
				add('coverage', null, `descriptive axis ${JSON.stringify(axis.id)} has ${tags.length} tag — an axis with one reading records nothing`)
			for (const required of ['positive', 'negative'] as Valence[])
				if (!tags.some((tag) => tag.valence === required))
					add(
						'coverage',
						null,
						`descriptive axis ${JSON.stringify(axis.id)} has no ${required} tag — an axis that can only record one sign is a one-way instrument`,
					)
		}
	}

	// 8. text hygiene
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

/** Axis definition by id, or null. */
export function axisById(vocabulary: Vocabulary, id: string): AxisDef | null {
	return vocabulary.axes.find((axis) => axis.id === id) ?? null
}

/** The opposite of a judgment tag; null for a descriptive tag and for an unknown one. */
export function oppositeOf(vocabulary: Vocabulary, id: string): string | null {
	return tagById(vocabulary, id)?.opposite ?? null
}

/** The alternative readings of a descriptive tag; empty for a judgment tag and an unknown one. */
export function counterpartsOf(vocabulary: Vocabulary, id: string): string[] {
	return tagById(vocabulary, id)?.counterparts ?? []
}

/** The kind of the axis a tag sits on, or null when either is unknown. */
export function kindOf(vocabulary: Vocabulary, id: string): AxisKind | null {
	const tag = tagById(vocabulary, id)
	if (!tag) return null
	return axisById(vocabulary, tag.axis)?.kind ?? null
}

/**
 * What a tag is about: its own `scope` when it overrides, otherwise its axis's. Null
 * when the tag or its axis is unknown.
 */
export function scopeOf(vocabulary: Vocabulary, id: string): Scope | null {
	const tag = tagById(vocabulary, id)
	if (!tag) return null
	if (tag.scope !== null) return tag.scope
	return axisById(vocabulary, tag.axis)?.scope ?? null
}

/** How many of these tags sit at each scope. Unknown tags are counted under `unknown`. */
export function scopeCounts(vocabulary: Vocabulary, tags: readonly string[]): Record<string, number> {
	const counts: Record<string, number> = {}
	for (const tag of tags) {
		const scope = scopeOf(vocabulary, tag) ?? 'unknown'
		counts[scope] = (counts[scope] ?? 0) + 1
	}
	return counts
}

/** Tags of one axis, in file order. */
export function tagsOfAxis(vocabulary: Vocabulary, axisId: string): TagDef[] {
	return vocabulary.tags.filter((tag) => tag.axis === axisId)
}

/** Axes of one kind, in file order. */
export function axesOfKind(vocabulary: Vocabulary, kind: AxisKind): AxisDef[] {
	return vocabulary.axes.filter((axis) => axis.kind === kind)
}

/** Tags whose axis is of the given kind, in file order. */
export function tagsOfKind(vocabulary: Vocabulary, kind: AxisKind): TagDef[] {
	const axes = new Set(axesOfKind(vocabulary, kind).map((axis) => axis.id))
	return vocabulary.tags.filter((tag) => axes.has(tag.axis))
}

/**
 * The `[a, b]` pairs of every **judgment** axis, each listed once, in first-seen order.
 * Descriptive tags have no pairs and never appear here. Only defined on a linted
 * vocabulary — call `assertVocabulary` first.
 */
export function tagPairs(vocabulary: Vocabulary): Array<[string, string]> {
	const seen = new Set<string>()
	const pairs: Array<[string, string]> = []
	for (const tag of tagsOfKind(vocabulary, 'judgment')) {
		if (seen.has(tag.id) || tag.opposite === null) continue
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
 * this check possible at all — it falls straight out of the rule, which is also why it
 * only ever fires on judgment tags: two descriptive observations about one instrument
 * ("it keys on typography" and "it groups boats across styles") are not in conflict,
 * and refusing them would be a false alarm.
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
