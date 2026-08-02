/**
 * V3 verdict warehouse — query CLI.
 *
 * This is the only interface agents use. Nobody reads the JSONL wholesale
 * (REVIEW_UI.md §1). Output is dense and parseable: one record per line, `key=value`
 * fields separated by single spaces, free text last after a ` | ` separator with
 * newlines escaped. No alignment, no colour, no boxes.
 *
 * Usage:
 *   node --experimental-strip-types research/v3/src/warehouse/cli.ts <command> [options]
 *
 * Commands:
 *   status                      one line per batch: purpose, items, reviewed, pending, released
 *   query                       filtered records (amendments applied, latest wins)
 *   tail --n <N>                the last N records as appended (amendments shown as records)
 *   recheck --decisions <file>  decisions funded by since-amended verdicts
 *
 * Common options:
 *   --file <path>      warehouse JSONL (default: research/v3/data/warehouse/warehouse.jsonl)
 *   --json             emit one JSON object per line instead of the dense format
 *
 * query options:
 *   --type <t[,t]>     verdict | note | endorsed-sample | veto | amendment | batch-complete | oracle-label
 *   --batch <id[,id]>
 *   --item <id[,id]>
 *   --artwork <s>      sha256 prefix, path substring, or oracle image id substring
 *   --since <iso>      inclusive
 *   --until <iso>      exclusive
 *   --confound         only confound-flagged verdicts
 *   --no-retracted     drop retracted records
 *   --latest           one verdict per item — drop pre-release drafts a later save replaced
 *   --raw              do not apply amendments; show amendment records too
 *   --full             do not truncate free text
 *   --chars <n>        free-text budget per line (default 96)
 *   --limit <n>        max lines (default 100; a trailing line reports the remainder)
 */

import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { readFileSync } from 'node:fs'
import Color from 'colorjs.io'
import { closest } from 'colornames-oklab'
import {
	RECORD_TYPES,
	type ArtworkIdentity,
	type RecordType,
	type WarehouseRecord,
} from './records.ts'
import {
	batchSummaries,
	filterResolved,
	findOrphanAmendments,
	readAll,
	recheckFundedBy,
	resolve,
	supersededIds,
	NO_BATCH,
	type FundedDecision,
	type QueryFilter,
	type Resolved,
} from './warehouse.ts'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Live warehouse file. The library always takes the path as a parameter; this is
 * only the CLI's default.
 * [REVIEWED] — storage location fixed by the Phase 0 workstream brief.
 */
export const DEFAULT_WAREHOUSE_PATH = join(HERE, '..', '..', 'data', 'warehouse', 'warehouse.jsonl')

/**
 * Characters of free text printed per line before truncation. Roughly one line of
 * terminal text; enough to recognise a comment, short enough that a 50-record query
 * stays cheap. `--full` disables truncation.
 * [UNCALIBRATED] — chosen here; adjust if reviewers' comments read as systematically clipped.
 */
const FREE_TEXT_CHARS = 96

/**
 * Default maximum lines emitted by `query`. A remainder line reports what was cut,
 * so a truncated result is never silently mistaken for a complete one.
 * [UNCALIBRATED] — chosen here.
 */
const QUERY_LIMIT = 100

/** Default record count for `tail`. [UNCALIBRATED] — chosen here. */
const TAIL_N = 20

/**
 * Characters of a content hash shown in dense output. 8 hex chars = 32 bits;
 * collisions are not a concern at review volumes and the full hash is one
 * `--json` away.
 * [UNCALIBRATED] — chosen here for line density.
 */
const HASH_PREFIX_CHARS = 8

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function short(hash: string): string {
	return hash.slice(0, HASH_PREFIX_CHARS)
}

/** One-line free text: newlines and tabs escaped, optionally truncated. */
function freeText(text: string, chars: number | null): string {
	const flat = text.replace(/\r?\n/g, '\\n').replace(/\t/g, '\\t').trim()
	if (chars === null || flat.length <= chars) return flat
	return `${flat.slice(0, chars)}…`
}

/** Human-facing colour output is always named (CONVENTIONS.md). Names are hyphenated so the line stays whitespace-parseable. */
function namedHex(hex: string): string {
	try {
		const coords = new Color(hex).to('oklab').coords as [number, number, number]
		const match = closest(coords) as { name: string }
		return `${hex}/${match.name.replace(/\s+/g, '-')}`
	} catch {
		return `${hex}/?`
	}
}

function artworkRef(artwork: ArtworkIdentity | null): string {
	if (!artwork) return 'art=-'
	return `art=${short(artwork.sha256)}:${basename(artwork.path)} ${artwork.rendition.width}x${artwork.rendition.height}`
}

function orDash(value: string | number | null | undefined): string {
	return value === null || value === undefined || value === '' ? '-' : String(value)
}

const PREF_SHORT: Record<string, string> = { a: 'a', b: 'b', 'no-preference': 'np' }

/** Dense one-line rendering of one resolved record. */
export function formatRecord(entry: Resolved, chars: number | null, superseded?: Set<string>): string {
	const record = entry.record
	const head = `${record.ts} ${record.id}`
	const flags: string[] = []
	if (entry.amendments.length) flags.push(`am=${entry.amendments.length}`)
	if (entry.retracted) flags.push('RETRACTED')
	if (superseded?.has(entry.original.id)) flags.push('SUPERSEDED')
	const suffix = flags.length ? ` ${flags.join(' ')}` : ''

	switch (record.type) {
		case 'verdict': {
			const a = `A=${record.gradeA}@${record.sideA.variantId}#${short(record.sideA.paletteHash)}`
			const b = record.sideB
				? `B=${record.gradeB}@${record.sideB.variantId}#${short(record.sideB.paletteHash)}`
				: 'B=-'
			const pref = `pref=${record.preference ? PREF_SHORT[record.preference] : '-'}`
			const cf = `cf=${record.confound ? 1 : 0}`
			const note = record.confound && record.confoundNote ? ` cfnote=${JSON.stringify(freeText(record.confoundNote, chars))}` : ''
			return (
				`${head} verdict ${record.batch.id}/${record.itemId} mode=${record.mode} ${a} ${b} ${pref} ${cf} ` +
				`${artworkRef(record.artwork)}${suffix}${note} | ${freeText(record.comment, chars)}`
			)
		}
		case 'note': {
			const scope = `${orDash(record.batch?.id)}/${orDash(record.itemId)}`
			const tags = `tags=${record.tags.length ? record.tags.join(',') : '-'}`
			const derived = record.derived ? `derived=${record.derived.agent}@${record.derived.agentVersion}<-${record.derived.fromRecordId}` : 'derived=-'
			return `${head} note ${scope} ${tags} ${derived} ${artworkRef(record.artwork)}${suffix} | ${freeText(record.text, chars)}`
		}
		case 'endorsed-sample': {
			const scope = `${orDash(record.batch?.id)}/${orDash(record.itemId)}`
			const p = record.palette
			const grad = p.gradient ? `grad=${p.gradient.stops.length}stops` : 'grad=flat'
			const colors = `bg=${namedHex(p.background)} sf=${namedHex(p.surface)} fg=${namedHex(p.foreground)} ac=${namedHex(p.accent)}`
			return `${head} endorsed ${scope} ${artworkRef(record.artwork)} ${colors} ${grad} hash=${short(record.paletteHash)}${suffix} | ${freeText(record.comment, chars)}`
		}
		case 'veto':
			return `${head} veto ${artworkRef(record.artwork)} scope=${record.scope}${suffix} | ${freeText(record.reason, chars)}`
		case 'amendment': {
			const fields = Object.keys(record.patch)
			return `${head} amend->${record.targetId} fields=${fields.length ? fields.join(',') : '-'} retract=${record.retract ? 1 : 0} | ${freeText(record.reason, chars)}`
		}
		case 'batch-complete':
			return `${head} batch-complete ${record.batchId} purpose=${orDash(record.purpose)} items=${orDash(record.itemCount)} released=${orDash(record.releasedItemIds?.length)}${suffix} | ${freeText(record.note, chars)}`
		case 'oracle-label': {
			const answer = Array.isArray(record.answer) ? record.answer.join(',') : String(record.answer)
			return (
				`${head} oracle ${record.imageId} ${record.questionKey}=${answer} sv=${record.labelSchemaVersion} ` +
				`conf=${orDash(record.confidence)} stratum=${orDash(record.stratum)}${suffix}` +
				(record.ambiguityNote ? ` | ${freeText(record.ambiguityNote, chars)}` : '')
			)
		}
	}
}

function asEntry(record: WarehouseRecord): Resolved {
	return { record, original: record, amendments: [], retracted: false, lastAmendedAt: null, changedFields: [] }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export interface CliResult {
	code: number
	out: string
	err: string
}

const HELP = `warehouse <status|query|tail|recheck> [options]

  status                       one line per batch (purpose, items, reviewed, pending, released)
  query [filters]              records with amendments applied (latest wins)
  tail --n <N>                 last N records as appended
  recheck --decisions <file>   decisions funded by since-amended verdicts

  --file <path>    warehouse JSONL (default research/v3/data/warehouse/warehouse.jsonl)
  --json           one JSON object per line
  --type --batch --item --artwork --since --until --confound --no-retracted --raw
  --latest --full --chars <n> --limit <n> --n <n> --fail-on-hit
`

/** Run the CLI over an argv tail (no node/script entries). Pure: returns the streams. */
export function runCli(argv: string[]): CliResult {
	let parsed
	try {
		parsed = parseArgs({
			args: argv,
			allowPositionals: true,
			strict: true,
			options: {
				file: { type: 'string' },
				type: { type: 'string', multiple: true },
				batch: { type: 'string', multiple: true },
				item: { type: 'string', multiple: true },
				artwork: { type: 'string' },
				since: { type: 'string' },
				until: { type: 'string' },
				confound: { type: 'boolean' },
				'no-retracted': { type: 'boolean' },
				raw: { type: 'boolean' },
				latest: { type: 'boolean' },
				full: { type: 'boolean' },
				chars: { type: 'string' },
				limit: { type: 'string' },
				n: { type: 'string' },
				json: { type: 'boolean' },
				decisions: { type: 'string' },
				'fail-on-hit': { type: 'boolean' },
				help: { type: 'boolean', short: 'h' },
			},
		})
	} catch (error) {
		return { code: 1, out: '', err: `${(error as Error).message}\n` }
	}

	const { values, positionals } = parsed
	const command = positionals[0]
	if (values.help) return { code: 0, out: HELP, err: '' }
	if (!command) return { code: 1, out: '', err: HELP }

	const file = values.file ?? DEFAULT_WAREHOUSE_PATH
	let records: WarehouseRecord[]
	try {
		records = readAll(file)
	} catch (error) {
		return { code: 1, out: '', err: `${(error as Error).message}\n` }
	}

	switch (command) {
		case 'status':
			return cmdStatus(records, Boolean(values.json))
		case 'query':
			return cmdQuery(records, values)
		case 'tail':
			return cmdTail(records, values)
		case 'recheck':
			return cmdRecheck(records, values)
		default:
			return { code: 1, out: '', err: `unknown command ${JSON.stringify(command)}\n${HELP}` }
	}
}

function cmdStatus(records: WarehouseRecord[], json: boolean): CliResult {
	const summaries = batchSummaries(records)
	if (json) return { code: 0, out: summaries.map((s) => JSON.stringify(s)).join('\n') + (summaries.length ? '\n' : ''), err: '' }

	const lines = summaries.map((s) => {
		const parts = [
			`batch=${s.batchId}`,
			`purpose=${orDash(s.purpose)}`,
			`items=${orDash(s.itemCount)}`,
			`reviewed=${s.reviewed}`,
			`pending=${orDash(s.pending)}`,
			`released=${s.released ?? 'no'}`,
		]
		if (s.notes) parts.push(`notes=${s.notes}`)
		if (s.endorsed) parts.push(`endorsed=${s.endorsed}`)
		if (s.vetoes) parts.push(`vetoes=${s.vetoes}`)
		if (s.labels) parts.push(`labels=${s.labels}`)
		if (s.amended) parts.push(`amended=${s.amended}`)
		if (s.retracted) parts.push(`retracted=${s.retracted}`)
		parts.push(`last=${s.lastTs}`)
		return parts.join(' ')
	})

	const open = summaries.filter((s) => s.batchId !== NO_BATCH && s.released === null).length
	const amendments = records.filter((r) => r.type === 'amendment').length
	const orphans = findOrphanAmendments(records).length
	lines.push(
		`total batches=${summaries.filter((s) => s.batchId !== NO_BATCH).length} open=${open} records=${records.length} ` +
			`verdicts=${records.filter((r) => r.type === 'verdict').length} amendments=${amendments} orphan-amendments=${orphans}`,
	)
	return { code: 0, out: `${lines.join('\n')}\n`, err: '' }
}

function splitList(values: string[] | undefined): string[] | undefined {
	if (!values) return undefined
	const out = values.flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean)
	return out.length ? out : undefined
}

type Values = ReturnType<typeof parseArgs>['values'] & Record<string, unknown>

function cmdQuery(records: WarehouseRecord[], values: Values): CliResult {
	const types = splitList(values.type as string[] | undefined) as RecordType[] | undefined
	if (types) {
		const unknown = types.filter((t) => !RECORD_TYPES.includes(t))
		if (unknown.length)
			return { code: 1, out: '', err: `unknown --type ${unknown.join(',')} (expected ${RECORD_TYPES.join(' | ')})\n` }
	}

	// Amendment records disappear once amendments are applied, so asking for them
	// implies raw mode.
	const raw = Boolean(values.raw) || Boolean(types?.includes('amendment'))
	const entries = raw ? records.map(asEntry) : resolve(records)

	const filter: QueryFilter = {
		types,
		batchIds: splitList(values.batch as string[] | undefined),
		itemIds: splitList(values.item as string[] | undefined),
		artwork: values.artwork as string | undefined,
		since: values.since as string | undefined,
		until: values.until as string | undefined,
		confound: values.confound ? true : undefined,
		excludeRetracted: Boolean(values['no-retracted']),
	}

	// Pre-release re-grades and undone label answers append a second record for the
	// same item; the last one is the reviewer's position. Superseded records stay
	// visible and flagged, never silently dropped, unless --latest asks for the
	// position only.
	const superseded = supersededIds(entries)
	const kept = values.latest ? entries.filter((entry) => !superseded.has(entry.original.id)) : entries

	const matched = filterResolved(kept, filter)
	const limit = values.limit ? Number(values.limit) : QUERY_LIMIT
	if (!Number.isFinite(limit) || limit < 0) return { code: 1, out: '', err: `bad --limit ${values.limit}\n` }
	const shown = matched.slice(0, limit)
	const chars = values.full ? null : values.chars ? Number(values.chars) : FREE_TEXT_CHARS
	if (chars !== null && (!Number.isFinite(chars) || chars < 1)) return { code: 1, out: '', err: `bad --chars ${values.chars}\n` }

	const lines = values.json
		? shown.map((entry) => JSON.stringify(entry.record))
		: shown.map((entry) => formatRecord(entry, chars, superseded))
	if (matched.length > shown.length) lines.push(`total shown=${shown.length} matched=${matched.length} (raise --limit)`)
	return { code: 0, out: lines.length ? `${lines.join('\n')}\n` : '', err: '' }
}

function cmdTail(records: WarehouseRecord[], values: Values): CliResult {
	const n = values.n ? Number(values.n) : TAIL_N
	if (!Number.isFinite(n) || n < 0) return { code: 1, out: '', err: `bad --n ${values.n}\n` }
	// tail is deliberately raw: it answers "what was just written", which includes
	// amendment records themselves.
	const shown = records.slice(Math.max(0, records.length - n))
	const chars = values.full ? null : values.chars ? Number(values.chars) : FREE_TEXT_CHARS
	const lines = values.json ? shown.map((r) => JSON.stringify(r)) : shown.map((r) => formatRecord(asEntry(r), chars))
	return { code: 0, out: lines.length ? `${lines.join('\n')}\n` : '', err: '' }
}

function cmdRecheck(records: WarehouseRecord[], values: Values): CliResult {
	const path = values.decisions as string | undefined
	if (!path) return { code: 1, out: '', err: 'recheck needs --decisions <file.json>\n' }
	let decisions: FundedDecision[]
	try {
		const parsed = JSON.parse(readFileSync(path, 'utf8'))
		decisions = Array.isArray(parsed) ? parsed : (parsed.decisions ?? [])
	} catch (error) {
		return { code: 1, out: '', err: `${(error as Error).message}\n` }
	}

	const hits = recheckFundedBy(decisions, records)
	if (values.json)
		return { code: hitCode(hits.length, values), out: hits.map((h) => JSON.stringify(h)).join('\n') + (hits.length ? '\n' : ''), err: '' }

	const lines = hits.map((hit) => {
		const stale = hit.stale.map((s) => s.recordId).join(',') || '-'
		const fields = [...new Set(hit.stale.flatMap((s) => s.changedFields))].join(',') || '-'
		const retracted = hit.stale.filter((s) => s.retracted).length
		return (
			`decision=${hit.decisionId} kind=${orDash(hit.kind)} ts=${orDash(hit.decisionTs)} ` +
			`stale=${hit.stale.length} retracted=${retracted} missing=${hit.missing.length} ids=${stale} fields=${fields}` +
			(hit.missing.length ? ` missing-ids=${hit.missing.join(',')}` : '')
		)
	})
	lines.push(`total decisions=${decisions.length} flagged=${hits.length}`)
	return { code: hitCode(hits.length, values), out: `${lines.join('\n')}\n`, err: '' }
}

function hitCode(hits: number, values: Values): number {
	return hits > 0 && values['fail-on-hit'] ? 1 : 0
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const result = runCli(process.argv.slice(2))
	if (result.out) process.stdout.write(result.out)
	if (result.err) process.stderr.write(result.err)
	process.exitCode = result.code
}
