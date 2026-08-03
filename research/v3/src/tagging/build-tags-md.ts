/**
 * V3 tagging — render TAGS.md from vocabulary.json.
 *
 * The JSON is the source of truth; the Markdown is a view of it. Generating rather than
 * hand-writing means the human-readable list can never disagree with the list the
 * linter and the importer use — a disagreement there would be exactly the kind of
 * instrument blind spot this vocabulary exists to prevent.
 *
 * Usage:
 *   node --experimental-strip-types research/v3/src/tagging/build-tags-md.ts [--check]
 *
 *   --check  exit 1 if the committed TAGS.md differs from what would be generated
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DEFAULT_VOCABULARY_PATH, loadVocabulary, tagById, tagPairs, tagsOfAxis, type Vocabulary } from './vocabulary.ts'

const HERE = dirname(fileURLToPath(import.meta.url))

/** Committed human-readable view of the vocabulary. [REVIEWED] — Phase 0 tagging brief. */
export const DEFAULT_TAGS_MD_PATH = join(HERE, '..', '..', 'data', 'tagging', 'TAGS.md')

/** Escape a cell for a Markdown table. */
function cell(text: string): string {
	return text.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

export function renderTagsMarkdown(vocabulary: Vocabulary): string {
	const pairs = tagPairs(vocabulary)
	const lines: string[] = []

	lines.push('# V3 reviewer-comment tag vocabulary')
	lines.push('')
	lines.push(`**Version:** ${vocabulary.version} · **Updated:** ${vocabulary.updated}`)
	lines.push('')
	lines.push('> Generated from `research/v3/data/tagging/vocabulary.json` by')
	lines.push('> `research/v3/src/tagging/build-tags-md.ts`. Edit the JSON, not this file.')
	lines.push('')
	lines.push('---')
	lines.push('')
	lines.push('## The rule')
	lines.push('')
	lines.push(vocabulary.rule)
	lines.push('')
	lines.push('## What a tag is')
	lines.push('')
	lines.push(vocabulary.epistemics)
	lines.push('')
	lines.push(
		`**${vocabulary.tags.length} tags in ${pairs.length} opposed pairs across ${vocabulary.axes.length} axes.** ` +
			'A tag id is `<axis>/<name>`. A comment maps to zero or more tags; zero is a real answer.',
	)
	lines.push('')
	lines.push('| axis | pairs | what it is about |')
	lines.push('| --- | --- | --- |')
	for (const axis of vocabulary.axes)
		lines.push(`| \`${axis.id}\` | ${tagsOfAxis(vocabulary, axis.id).length / 2} | ${cell(axis.about)} |`)
	lines.push('')

	for (const axis of vocabulary.axes) {
		lines.push('---')
		lines.push('')
		lines.push(`## ${axis.title} — \`${axis.id}\``)
		lines.push('')
		lines.push(axis.about)
		lines.push('')
		const axisTags = tagsOfAxis(vocabulary, axis.id)
		const seen = new Set<string>()
		for (const tag of axisTags) {
			if (seen.has(tag.id)) continue
			seen.add(tag.id)
			seen.add(tag.opposite)
			const other = tagById(vocabulary, tag.opposite)
			lines.push(`### \`${tag.id}\` ↔ \`${tag.opposite}\``)
			lines.push('')
			lines.push('| tag | means | example phrase |')
			lines.push('| --- | --- | --- |')
			lines.push(`| \`${tag.id}\` | ${cell(tag.definition)} | *${cell(tag.example)}* |`)
			if (other) lines.push(`| \`${other.id}\` | ${cell(other.definition)} | *${cell(other.example)}* |`)
			lines.push('')
		}
	}

	lines.push('---')
	lines.push('')
	lines.push('## Flat index')
	lines.push('')
	lines.push('| tag | opposite |')
	lines.push('| --- | --- |')
	for (const tag of [...vocabulary.tags].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)))
		lines.push(`| \`${tag.id}\` | \`${tag.opposite}\` |`)
	lines.push('')

	return `${lines.join('\n')}`
}

export interface CliResult {
	code: number
	out: string
	err: string
}

export function runCli(argv: string[]): CliResult {
	const check = argv.includes('--check')
	const vocabulary = loadVocabulary(DEFAULT_VOCABULARY_PATH)
	const rendered = renderTagsMarkdown(vocabulary)
	if (!check) {
		writeFileSync(DEFAULT_TAGS_MD_PATH, rendered, 'utf8')
		return { code: 0, out: `${DEFAULT_TAGS_MD_PATH}\n`, err: '' }
	}
	let current = ''
	try {
		current = readFileSync(DEFAULT_TAGS_MD_PATH, 'utf8')
	} catch {
		return { code: 1, out: '', err: `TAGS.md is missing; run build-tags-md.ts\n` }
	}
	if (current !== rendered) return { code: 1, out: '', err: `TAGS.md is out of date; run build-tags-md.ts\n` }
	return { code: 0, out: 'TAGS.md is up to date\n', err: '' }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const result = runCli(process.argv.slice(2))
	if (result.out) process.stdout.write(result.out)
	if (result.err) process.stderr.write(result.err)
	process.exitCode = result.code
}
