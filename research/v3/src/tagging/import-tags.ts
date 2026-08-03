/**
 * V3 tagging — validate a filled work file and file derived note records.
 *
 * Every entry the tagger filled in becomes one `note` record with a `derived` block
 * pointing back at the source record (REVIEW_UI.md §4). The raw text is never touched:
 * derived records are an index over it, and can be dropped and rebuilt at any time.
 *
 * Usage:
 *   node --experimental-strip-types research/v3/src/tagging/import-tags.ts <work-file> [options]
 *
 * Options:
 *   --file <path>        warehouse JSONL (default: research/v3/data/warehouse/warehouse.jsonl)
 *   --vocabulary <path>  vocabulary JSON (default: research/v3/data/tagging/vocabulary.json)
 *   --dry-run            validate and report, write nothing
 *   --supersede          retract existing derived records for these sources first
 *   --allow-vocab-drift  accept a work file exported against a different vocabulary version
 *   --ambiguous <path>   also write the entries flagged `unsure` to this file, for human review
 *   --json               machine-readable report
 *
 * Validation, all of it before anything is written (an import is all-or-nothing):
 *   1. the vocabulary itself passes the symmetry linter — a broken vocabulary can only
 *      produce tags nobody should trust
 *   2. the work file parses and its format version is supported
 *   3. its vocabulary version matches the current one (unless --allow-vocab-drift)
 *   4. every tag is in the vocabulary
 *   5. no entry carries a tag and its opposite — a contradiction that only a symmetric
 *      vocabulary can detect at all
 *   6. every sourceId exists in the warehouse, is not retracted, and is a record type
 *      that carries free text
 *   7. no duplicate sourceId inside one work file
 *
 * Idempotency: an entry whose source already has a non-retracted derived record from
 * the same agent at the same vocabulary version is skipped. Re-importing the same work
 * file therefore appends nothing.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import type { AmendmentRecord, NoteRecord, RecordInput, RecordType, WarehouseRecord } from '../warehouse/records.ts'
import { append, readAll, resolve, type Resolved } from '../warehouse/warehouse.ts'
import { contradictions, loadVocabulary, unknownTags, AMBIGUITY_TAG, TaggingError, type Vocabulary } from './vocabulary.ts'
import { derivedIndex, freeTextOf, DEFAULT_WAREHOUSE_PATH } from './export-untagged.ts'
import { isFilled, parseWorkFile, TAGGING_AGENT, type WorkEntry, type WorkFile } from './work-file.ts'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Where `--ambiguous` writes by default when the flag is given without a path.
 * [UNCALIBRATED] — chosen here, inside the tagging workstream's owned data path.
 */
export const DEFAULT_AMBIGUOUS_PATH = join(HERE, '..', '..', 'data', 'tagging', 'work', 'needs-human-review.json')

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationProblem {
	kind: 'unknown-tag' | 'contradiction' | 'missing-source' | 'retracted-source' | 'untaggable-source' | 'duplicate-source' | 'vocabulary-drift'
	sourceId: string | null
	message: string
}

export interface ValidateOptions {
	vocabulary: Vocabulary
	records: WarehouseRecord[]
	allowVocabularyDrift?: boolean
}

export interface ValidatedWork {
	/** Entries the tagger filled in, in file order. */
	filled: WorkEntry[]
	/** Entries left untouched (no `tags` array) — reported, never imported. */
	unfilled: WorkEntry[]
	problems: ValidationProblem[]
	/** Resolved source records, keyed by id, for the entries that resolved. */
	sources: Map<string, Resolved>
}

/**
 * Check a work file against the vocabulary and the warehouse. Returns every problem
 * rather than throwing on the first — a tagging pass is worth reporting in full.
 */
export function validateWorkFile(workFile: WorkFile, options: ValidateOptions): ValidatedWork {
	const { vocabulary } = options
	const problems: ValidationProblem[] = []
	const filled: WorkEntry[] = []
	const unfilled: WorkEntry[] = []

	if (!options.allowVocabularyDrift && workFile.vocabularyVersion !== vocabulary.version)
		problems.push({
			kind: 'vocabulary-drift',
			sourceId: null,
			message:
				`work file was exported against vocabulary ${workFile.vocabularyVersion}, current is ${vocabulary.version}. ` +
				`Re-export, or pass --allow-vocab-drift if the moved tags are unrelated.`,
		})

	const entries = resolve(options.records)
	const byId = new Map(entries.map((entry) => [entry.original.id, entry]))
	const sources = new Map<string, Resolved>()
	const seen = new Set<string>()

	for (const entry of workFile.entries) {
		if (seen.has(entry.sourceId))
			problems.push({ kind: 'duplicate-source', sourceId: entry.sourceId, message: 'appears more than once in this work file' })
		seen.add(entry.sourceId)

		const source = byId.get(entry.sourceId)
		if (!source) {
			problems.push({ kind: 'missing-source', sourceId: entry.sourceId, message: 'no such record in the warehouse' })
		} else if (source.retracted) {
			problems.push({ kind: 'retracted-source', sourceId: entry.sourceId, message: 'source record has been retracted' })
		} else if (freeTextOf(source.record) === null) {
			problems.push({
				kind: 'untaggable-source',
				sourceId: entry.sourceId,
				message: `a ${source.record.type} record carries no taggable free text (a derived note cannot be tagged)`,
			})
		} else {
			sources.set(entry.sourceId, source)
		}

		if (!isFilled(entry)) {
			unfilled.push(entry)
			continue
		}
		filled.push(entry)

		const tags = entry.tags ?? []
		for (const tag of unknownTags(vocabulary, tags))
			problems.push({ kind: 'unknown-tag', sourceId: entry.sourceId, message: `tag ${JSON.stringify(tag)} is not in the vocabulary` })
		for (const [a, b] of contradictions(vocabulary, tags))
			problems.push({
				kind: 'contradiction',
				sourceId: entry.sourceId,
				message: `carries both ${JSON.stringify(a)} and its opposite ${JSON.stringify(b)}`,
			})
	}

	return { filled, unfilled, problems, sources }
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface ImportOptions {
	warehouseFile: string
	vocabulary: Vocabulary
	/** Pre-read records; read from `warehouseFile` when absent. */
	records?: WarehouseRecord[]
	dryRun?: boolean
	/** Retract existing derived records for these sources before filing fresh ones. */
	supersede?: boolean
	allowVocabularyDrift?: boolean
	now?: () => number
	idFactory?: (type: RecordType, now: number) => string
	fsync?: boolean
}

export interface ImportReport {
	agent: string
	vocabularyVersion: string
	entries: number
	filled: number
	unfilled: number
	imported: number
	/** Skipped because a current derived record already exists (the idempotency path). */
	skippedAlreadyDerived: number
	/** Skipped because validation found a problem with that entry. */
	skippedInvalid: number
	retracted: number
	ambiguous: WorkEntry[]
	problems: ValidationProblem[]
	appendedIds: string[]
	dryRun: boolean
	/** Entries filed with no tags at all — the vocabulary-coverage canary. */
	zeroTag: number
}

/**
 * Build the derived note record for one entry.
 *
 * Batch, item and artwork are copied from the source so the derived record is
 * queryable exactly like the record it indexes. `text` holds the tagger's one-line
 * rationale, not a copy of the reviewer's words: duplicating the raw text would create
 * a second thing to keep in sync, and the raw text is authoritative.
 */
export function buildDerivedNote(entry: WorkEntry, source: Resolved, agent: string, agentVersion: string): RecordInput<NoteRecord> {
	const record = source.record
	const batch = (record as { batch?: NoteRecord['batch'] }).batch ?? null
	const artwork = (record as { artwork?: NoteRecord['artwork'] }).artwork ?? null
	const tags = [...(entry.tags ?? [])]
	if (entry.unsure === true && !tags.includes(AMBIGUITY_TAG)) tags.push(AMBIGUITY_TAG)
	return {
		type: 'note',
		author: { kind: 'agent', id: agent },
		batch,
		itemId: (record as { itemId?: string | null }).itemId ?? null,
		artwork,
		text: entry.note ?? '',
		tags,
		derived: { fromRecordId: entry.sourceId, agent, agentVersion },
	}
}

/** Validate a work file and append the derived records it describes. */
export function importTags(workFile: WorkFile, options: ImportOptions): ImportReport {
	const agent = workFile.agent || TAGGING_AGENT
	const records = options.records ?? readAll(options.warehouseFile)
	const validated = validateWorkFile(workFile, {
		vocabulary: options.vocabulary,
		records,
		allowVocabularyDrift: options.allowVocabularyDrift,
	})

	const badSources = new Set(validated.problems.filter((p) => p.sourceId !== null).map((p) => p.sourceId!))
	const globalProblems = validated.problems.filter((p) => p.sourceId === null)

	const index = derivedIndex(resolve(records), agent)
	const appendOptions = { now: options.now, idFactory: options.idFactory, fsync: options.fsync }

	const report: ImportReport = {
		agent,
		vocabularyVersion: options.vocabulary.version,
		entries: workFile.entries.length,
		filled: validated.filled.length,
		unfilled: validated.unfilled.length,
		imported: 0,
		skippedAlreadyDerived: 0,
		skippedInvalid: 0,
		retracted: 0,
		ambiguous: [],
		problems: validated.problems,
		appendedIds: [],
		dryRun: options.dryRun === true,
		zeroTag: 0,
	}

	// A global problem invalidates the whole file — nothing is written.
	if (globalProblems.length) return report

	for (const entry of validated.filled) {
		if (badSources.has(entry.sourceId)) {
			report.skippedInvalid++
			continue
		}
		const source = validated.sources.get(entry.sourceId)
		if (!source) {
			report.skippedInvalid++
			continue
		}

		const existing = index.get(entry.sourceId)
		const current = existing?.versions.includes(options.vocabulary.version) === true
		if (current && options.supersede !== true) {
			report.skippedAlreadyDerived++
			continue
		}

		if (entry.unsure === true) report.ambiguous.push(entry)
		if ((entry.tags ?? []).length === 0) report.zeroTag++

		if (options.dryRun === true) {
			report.imported++
			continue
		}

		if (options.supersede === true && existing) {
			for (const derivedId of existing.ids) {
				const amendment: RecordInput<AmendmentRecord> = {
					type: 'amendment',
					author: { kind: 'agent', id: agent },
					targetId: derivedId,
					patch: {},
					retract: true,
					reason: `superseded by a re-derivation at vocabulary ${options.vocabulary.version}`,
				}
				append(options.warehouseFile, amendment, appendOptions)
				report.retracted++
			}
		}

		const stored = append(options.warehouseFile, buildDerivedNote(entry, source, agent, options.vocabulary.version), appendOptions)
		report.appendedIds.push(stored.id)
		report.imported++
	}

	return report
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export interface CliResult {
	code: number
	out: string
	err: string
}

function formatReport(report: ImportReport): string {
	const lines = [
		`agent=${report.agent} vocabulary=${report.vocabularyVersion}${report.dryRun ? ' dry-run=yes' : ''}`,
		`entries=${report.entries} filled=${report.filled} unfilled=${report.unfilled}`,
		`imported=${report.imported} already-derived=${report.skippedAlreadyDerived} invalid=${report.skippedInvalid} ` +
			`retracted=${report.retracted} zero-tag=${report.zeroTag} ambiguous=${report.ambiguous.length}`,
	]
	for (const problem of report.problems) lines.push(`problem ${problem.kind} source=${problem.sourceId ?? '-'} | ${problem.message}`)
	return `${lines.join('\n')}\n`
}

export function runCli(argv: string[], deps: { now?: () => number } = {}): CliResult {
	let values: Record<string, string | boolean | undefined>
	let positionals: string[]
	try {
		;({ values, positionals } = parseArgs({
			args: argv,
			options: {
				file: { type: 'string' },
				vocabulary: { type: 'string' },
				'dry-run': { type: 'boolean' },
				supersede: { type: 'boolean' },
				'allow-vocab-drift': { type: 'boolean' },
				ambiguous: { type: 'string' },
				json: { type: 'boolean' },
			},
			allowPositionals: true,
		}) as { values: Record<string, string | boolean | undefined>; positionals: string[] })
	} catch (error) {
		return { code: 2, out: '', err: `${(error as Error).message}\n` }
	}

	const workPath = positionals[0]
	if (!workPath) return { code: 2, out: '', err: 'usage: import-tags.ts <work-file> [options]\n' }

	let vocabulary: Vocabulary
	try {
		vocabulary = loadVocabulary(typeof values.vocabulary === 'string' ? values.vocabulary : undefined)
	} catch (error) {
		return { code: 2, out: '', err: `${(error as Error).message}\n` }
	}

	let workFile: WorkFile
	try {
		workFile = parseWorkFile(JSON.parse(readFileSync(workPath, 'utf8')), workPath)
	} catch (error) {
		return { code: 2, out: '', err: `${(error as Error).message}\n` }
	}

	const warehouseFile = (values.file as string | undefined) ?? DEFAULT_WAREHOUSE_PATH
	let report: ImportReport
	try {
		report = importTags(workFile, {
			warehouseFile,
			vocabulary,
			dryRun: values['dry-run'] === true,
			supersede: values.supersede === true,
			allowVocabularyDrift: values['allow-vocab-drift'] === true,
			now: deps.now,
		})
	} catch (error) {
		return { code: 1, out: '', err: `${(error as Error).message}\n` }
	}

	if (values.ambiguous !== undefined && report.ambiguous.length) {
		const path = typeof values.ambiguous === 'string' && values.ambiguous ? values.ambiguous : DEFAULT_AMBIGUOUS_PATH
		try {
			writeFileSync(
				path,
				`${JSON.stringify({ ...workFile, entries: report.ambiguous, instructions: 'Entries the tagging agent could not map confidently. A human decides; re-run import after editing.' }, null, '\t')}\n`,
				'utf8',
			)
		} catch (error) {
			return { code: 1, out: '', err: `${(error as Error).message}\n` }
		}
	}

	const out = values.json === true ? `${JSON.stringify(report)}\n` : formatReport(report)
	// Any problem is a non-zero exit: a tagging pass that silently half-landed is worse
	// than one that stopped and said so.
	return { code: report.problems.length ? 1 : 0, out, err: '' }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const result = runCli(process.argv.slice(2))
	if (result.out) process.stdout.write(result.out)
	if (result.err) process.stderr.write(result.err)
	process.exitCode = result.code
}

export { TaggingError }
