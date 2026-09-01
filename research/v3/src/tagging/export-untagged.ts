/**
 * V3 tagging — export untagged free text as a work file.
 *
 * Reads the warehouse through the warehouse library, finds every piece of reviewer
 * free text that does not yet have a current derived tag record, and writes a work
 * file for a tagging subagent to fill in (`TAGGING_PROTOCOL.md`).
 *
 * Usage:
 *   node --experimental-strip-types research/v3/src/tagging/export-untagged.ts [options]
 *
 * Options:
 *   --file <path>       warehouse JSONL (default: the warehouse CLI's default path)
 *   --out <path>        work file to write (default: research/v3/data/tagging/work/untagged-<ts>.json)
 *   --vocabulary <path> vocabulary JSON (default: research/v3/data/tagging/vocabulary.json)
 *   --agent <id>        derived-record agent id (default: tagging-agent)
 *   --type <t[,t]>      source record types (default: verdict,note)
 *   --batch <id[,id]>   only these batches
 *   --all               export every source, tagged or not (for a full re-derivation)
 *   --any-version       treat a derived record from any vocabulary version as current
 *   --limit <n>         cap the number of entries (a partial pass; the rest resurface next time)
 *   --quiet             no summary on stderr
 *   --stdout            write the work file to stdout instead of a file
 *
 * What counts as "needs tagging":
 *  - the source record is not retracted, and is not a superseded pre-release draft
 *  - it carries non-empty free text
 *  - it is not itself a derived record (never tag the tagger's own output)
 *  - and one of: no derived record points at it; the newest one came from a different
 *    vocabulary version; or the source has been amended since the newest one was filed
 *    (an amended comment is different text and owes a fresh mapping)
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { RECORD_TYPES, type RecordType, type WarehouseRecord } from '../warehouse/records.ts'
import { readAll, resolve, supersededIds, type Resolved } from '../warehouse/warehouse.ts'
import { loadVocabulary, type Vocabulary } from './vocabulary.ts'
import {
	DEFAULT_SOURCE_TYPES,
	TAGGABLE_SOURCE_TYPES,
	TAGGING_AGENT,
	WORK_FILE_FORMAT_VERSION,
	WORK_FILE_KIND,
	type WorkContext,
	type WorkEntry,
	type WorkFile,
} from './work-file.ts'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Directory for generated work files. They are scratch: an exported work file is
 * reproducible from the warehouse at any time, and carries no information the
 * warehouse does not already have.
 * [UNCALIBRATED] — chosen here, inside the tagging workstream's owned data path.
 */
export const DEFAULT_WORK_DIR = join(HERE, '..', '..', 'data', 'tagging', 'work')

/**
 * Live warehouse file. Restated here rather than imported from `warehouse/cli.ts`,
 * whose module body pulls in the colour libraries for its human-facing output; this
 * tool needs the path only. Must stay equal to `cli.ts` `DEFAULT_WAREHOUSE_PATH` — the
 * test suite asserts it.
 * [REVIEWED] — storage location fixed by the Phase 0 warehouse workstream.
 */
export const DEFAULT_WAREHOUSE_PATH = join(HERE, '..', '..', 'data', 'warehouse', 'warehouse.jsonl')

/**
 * One-line pointer written into every work file, so a work file found on its own says
 * what it is.
 * [REVIEWED] — TAGGING_PROTOCOL.md.
 */
const WORK_FILE_INSTRUCTIONS =
	'Fill in "tags" on every entry (an empty array means "read it, no vocabulary tag applies"). ' +
	'Use only tag ids from the vocabulary. Set "unsure": true when the mapping is ambiguous. ' +
	'See research/v3/src/tagging/TAGGING_PROTOCOL.md.'

// ---------------------------------------------------------------------------
// Reading free text out of records
// ---------------------------------------------------------------------------

/**
 * The free-text field of each taggable record type.
 *
 * A verdict's `confoundNote` is deliberately not a tagging unit of its own: the tagged
 * unit is one record, and one record gets one derived record (`derived.fromRecordId`
 * has no field slot). The confound note travels in `context` instead, where it
 * disambiguates the comment, and the confound *fact* is already queryable as a boolean.
 */
export function freeTextOf(record: WarehouseRecord): string | null {
	switch (record.type) {
		case 'verdict':
			return record.comment
		case 'note':
			// Never tag a derived record — that is the tagger's own output.
			return record.derived === null ? record.text : null
		case 'endorsed-sample':
			return record.comment
		case 'veto':
			return record.reason
		case 'batch-complete':
			return record.note
		default:
			return null
	}
}

function contextOf(entry: Resolved): WorkContext {
	const record = entry.record
	const batch = (record as { batch?: { id: string; purpose: string } | null }).batch ?? null
	const artwork = (record as { artwork?: { path: string; sha256: string } | null }).artwork ?? null
	const context: WorkContext = {
		batchId: record.type === 'batch-complete' ? record.batchId : (batch?.id ?? null),
		batchPurpose: record.type === 'batch-complete' ? record.purpose : (batch?.purpose ?? null),
		itemId: (record as { itemId?: string | null }).itemId ?? null,
		artworkPath: artwork?.path ?? null,
		artworkSha256: artwork?.sha256 ?? null,
		sourceTs: record.ts,
		amendedAt: entry.lastAmendedAt,
	}
	if (record.type === 'verdict') {
		context.mode = record.mode
		context.gradeA = record.gradeA
		context.gradeB = record.gradeB
		context.preference = record.preference
		context.confound = record.confound
		context.confoundNote = record.confoundNote
	}
	return context
}

// ---------------------------------------------------------------------------
// The derived index
// ---------------------------------------------------------------------------

export interface DerivedInfo {
	/** Newest non-retracted derived record for this source, by timestamp. */
	newestTs: string
	/** Vocabulary versions seen across this source's derived records. */
	versions: string[]
	ids: string[]
}

/**
 * Map source record id → what the tagging agent has already filed about it.
 * Only records from `agent` count; a different agent's index is a different index.
 */
export function derivedIndex(entries: Resolved[], agent: string): Map<string, DerivedInfo> {
	const index = new Map<string, DerivedInfo>()
	for (const entry of entries) {
		if (entry.retracted) continue
		const record = entry.record
		if (record.type !== 'note' || record.derived === null) continue
		if (record.derived.agent !== agent) continue
		const existing = index.get(record.derived.fromRecordId)
		if (!existing) {
			index.set(record.derived.fromRecordId, {
				newestTs: record.ts,
				versions: [record.derived.agentVersion],
				ids: [entry.original.id],
			})
			continue
		}
		if (record.ts > existing.newestTs) existing.newestTs = record.ts
		if (!existing.versions.includes(record.derived.agentVersion)) existing.versions.push(record.derived.agentVersion)
		existing.ids.push(entry.original.id)
	}
	return index
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

export interface CollectOptions {
	vocabulary: Vocabulary
	agent?: string
	sourceTypes?: RecordType[]
	batchIds?: string[]
	/** Export everything, even sources that already have a current derived record. */
	all?: boolean
	/** Accept a derived record from any vocabulary version as current. */
	anyVersion?: boolean
	limit?: number
}

export interface CollectResult {
	entries: WorkEntry[]
	/** Sources with free text that were considered. */
	considered: number
	/** Sources skipped because a current derived record already exists. */
	alreadyTagged: number
	/** Sources re-exported because the vocabulary moved on. */
	staleVersion: number
	/** Sources re-exported because the source text was amended after it was tagged. */
	staleAmended: number
	/** Entries dropped by `--limit`. */
	truncated: number
}

/** Find every source record whose free text needs tagging. */
export function collectUntagged(records: Iterable<WarehouseRecord>, options: CollectOptions): CollectResult {
	const agent = options.agent ?? TAGGING_AGENT
	const sourceTypes = new Set(options.sourceTypes ?? DEFAULT_SOURCE_TYPES)
	const batchIds = options.batchIds ? new Set(options.batchIds) : null

	const entries = resolve([...records])
	const superseded = supersededIds(entries)
	const index = derivedIndex(entries, agent)

	const result: CollectResult = {
		entries: [],
		considered: 0,
		alreadyTagged: 0,
		staleVersion: 0,
		staleAmended: 0,
		truncated: 0,
	}

	for (const entry of entries) {
		const record = entry.record
		if (!sourceTypes.has(record.type)) continue
		if (entry.retracted) continue
		if (superseded.has(entry.original.id)) continue

		const text = freeTextOf(record)
		if (text === null || text.trim().length === 0) continue

		const context = contextOf(entry)
		if (batchIds && (context.batchId === null || !batchIds.has(context.batchId))) continue

		result.considered++

		if (!options.all) {
			const derived = index.get(entry.original.id)
			if (derived) {
				const versionCurrent = options.anyVersion || derived.versions.includes(options.vocabulary.version)
				const amendedSince = entry.lastAmendedAt !== null && entry.lastAmendedAt > derived.newestTs
				if (versionCurrent && !amendedSince) {
					result.alreadyTagged++
					continue
				}
				if (!versionCurrent) result.staleVersion++
				else result.staleAmended++
			}
		}

		if (options.limit !== undefined && result.entries.length >= options.limit) {
			result.truncated++
			continue
		}

		result.entries.push({
			sourceId: entry.original.id,
			sourceType: record.type,
			text,
			context,
		})
	}

	return result
}

export interface BuildOptions extends CollectOptions {
	warehouseFile: string
	now?: () => number
}

export function buildWorkFile(records: Iterable<WarehouseRecord>, options: BuildOptions): { file: WorkFile; stats: CollectResult } {
	const stats = collectUntagged(records, options)
	const now = (options.now ?? Date.now)()
	return {
		file: {
			kind: WORK_FILE_KIND,
			formatVersion: WORK_FILE_FORMAT_VERSION,
			vocabularyVersion: options.vocabulary.version,
			agent: options.agent ?? TAGGING_AGENT,
			generatedAt: new Date(now).toISOString(),
			warehouse: options.warehouseFile,
			instructions: WORK_FILE_INSTRUCTIONS,
			entries: stats.entries,
		},
		stats,
	}
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export interface CliResult {
	code: number
	out: string
	err: string
}

function splitList(value: string | undefined): string[] | undefined {
	if (value === undefined) return undefined
	return value
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean)
}

export function runCli(argv: string[], deps: { now?: () => number } = {}): CliResult {
	let values: Record<string, string | boolean | undefined>
	try {
		;({ values } = parseArgs({
			args: argv,
			options: {
				file: { type: 'string' },
				out: { type: 'string' },
				vocabulary: { type: 'string' },
				agent: { type: 'string' },
				type: { type: 'string' },
				batch: { type: 'string' },
				all: { type: 'boolean' },
				'any-version': { type: 'boolean' },
				limit: { type: 'string' },
				quiet: { type: 'boolean' },
				stdout: { type: 'boolean' },
			},
			allowPositionals: false,
		}) as { values: Record<string, string | boolean | undefined> })
	} catch (error) {
		return { code: 2, out: '', err: `${(error as Error).message}\n` }
	}

	let vocabulary: Vocabulary
	try {
		vocabulary = loadVocabulary(typeof values.vocabulary === 'string' ? values.vocabulary : undefined)
	} catch (error) {
		return { code: 2, out: '', err: `${(error as Error).message}\n` }
	}

	const sourceTypes = splitList(values.type as string | undefined) as RecordType[] | undefined
	if (sourceTypes) {
		for (const type of sourceTypes) {
			if (!RECORD_TYPES.includes(type)) return { code: 2, out: '', err: `unknown record type ${JSON.stringify(type)}\n` }
			if (!TAGGABLE_SOURCE_TYPES.includes(type))
				return { code: 2, out: '', err: `record type ${JSON.stringify(type)} carries no taggable free text\n` }
		}
	}

	const limitRaw = values.limit as string | undefined
	const limit = limitRaw === undefined ? undefined : Number(limitRaw)
	if (limit !== undefined && (!Number.isInteger(limit) || limit < 0))
		return { code: 2, out: '', err: `--limit must be a non-negative integer\n` }

	const warehouseFile = (values.file as string | undefined) ?? DEFAULT_WAREHOUSE_PATH
	let records: WarehouseRecord[]
	try {
		records = readAll(warehouseFile)
	} catch (error) {
		return { code: 1, out: '', err: `${(error as Error).message}\n` }
	}

	const { file, stats } = buildWorkFile(records, {
		warehouseFile,
		vocabulary,
		agent: values.agent as string | undefined,
		sourceTypes,
		batchIds: splitList(values.batch as string | undefined),
		all: values.all === true,
		anyVersion: values['any-version'] === true,
		limit,
		now: deps.now,
	})

	const json = `${JSON.stringify(file, null, '\t')}\n`
	const summary =
		`entries=${file.entries.length} considered=${stats.considered} already-tagged=${stats.alreadyTagged} ` +
		`stale-version=${stats.staleVersion} stale-amended=${stats.staleAmended} truncated=${stats.truncated} ` +
		`vocabulary=${vocabulary.version}`

	if (values.stdout === true) return { code: 0, out: json, err: values.quiet === true ? '' : `${summary}\n` }

	const outPath =
		(values.out as string | undefined) ?? join(DEFAULT_WORK_DIR, `untagged-${file.generatedAt.replace(/[:.]/g, '-')}.json`)
	try {
		mkdirSync(dirname(outPath), { recursive: true })
		writeFileSync(outPath, json, 'utf8')
	} catch (error) {
		return { code: 1, out: '', err: `${(error as Error).message}\n` }
	}
	return { code: 0, out: `${outPath}\n`, err: values.quiet === true ? '' : `${summary}\n` }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const result = runCli(process.argv.slice(2))
	if (result.out) process.stdout.write(result.out)
	if (result.err) process.stderr.write(result.err)
	process.exitCode = result.code
}
