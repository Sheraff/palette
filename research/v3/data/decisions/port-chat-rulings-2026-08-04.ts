/**
 * Port the reviewer's conversational rulings of 2026-08-04 into the warehouse as `note`
 * records, so the decision records written in the same ledger pass can cite them by id
 * instead of carrying an empty `fundedBy`.
 *
 * This is the mechanism `data/decisions/README.md` calls the only one that has ever
 * converted an empty `fundedBy` into a full one: **port the reviewer's words first, then
 * write the record.** It costs a deliberate port every time and it works only for things
 * the reviewer actually *said*. Nothing here can fund a decision the reviewer merely made
 * — those records stay empty on purpose, and say so.
 *
 * Sibling of `data/tagging/port-reviewer-notes.ts` (ledger pass 3), same shape, same
 * idempotency rule, different source. It lives here rather than there because the source
 * is a conversation this pass transcribed, not a workstream document the tagging flow owns.
 *
 * ## Two kinds of record are written, and they must not be confused
 *
 * 1. **Reviewer notes** — `author {kind:'human', id:'flo'}`, `derived: null`. Everything
 *    inside double quotes is the reviewer verbatim as relayed to this pass. Text outside
 *    the quotes is the minimum framing the quote needs to stand alone. Orchestrator
 *    readings and consequences are **not** ported; they belong in decision records, which
 *    are signed by the orchestrator and can be argued with.
 *
 * 2. **Derived caveat notes** — `author {kind:'agent'}`, `derived.fromRecordId` pointing at
 *    the reviewer note that supersedes them. These annotate answers already in the log
 *    whose standing changed. They are **not retractions**: the answers stay, resolve
 *    normally, and keep counting wherever they counted. The caveat is the dated sentence
 *    a later reader needs in order to know the chat outranked the round. Being derived,
 *    they can be dropped and rebuilt from the ruling at any time.
 *
 * ## Why the answers are annotated rather than amended
 *
 * `data/decisions/README.md`: every amendment in this warehouse so far is an agent-authored
 * retraction of a *derived* note, and there are **zero** reviewer amendments. An agent
 * retracting a reviewer's own answer would be a new and much larger move than this pass is
 * entitled to make, and the reviewer did not ask for the answers to be withdrawn — they
 * asked for them to be ignored in favour of a rule. A note says exactly that and destroys
 * nothing.
 *
 * Usage:
 *   node --experimental-strip-types research/v3/data/decisions/port-chat-rulings-2026-08-04.ts [--dry-run] [--file <warehouse.jsonl>]
 *
 * Modifies no warehouse source; uses the public `append` / `readAll` only.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import type { NoteRecord, RecordInput } from '../../src/warehouse/records.ts'
import { append, readAll } from '../../src/warehouse/warehouse.ts'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Live warehouse file.
 * [REVIEWED] — storage location fixed by the Phase 0 warehouse workstream; same path as
 * `data/tagging/port-reviewer-notes.ts` `DEFAULT_WAREHOUSE_PATH`.
 */
const DEFAULT_WAREHOUSE_PATH = join(HERE, '..', 'warehouse', 'warehouse.jsonl')

/**
 * Author id for the reviewer.
 * [MEASURED] — every one of the 1,196 human records in `data/warehouse/warehouse.jsonl`
 * carries `author.id = "flo"` (2026-08-04). A second spelling silently splits any query
 * for "everything the reviewer said" in two.
 */
const REVIEWER_ID = 'flo'

/**
 * Author id for the derived caveat notes.
 * [n=1] — chosen here. The only other agent author in the log is `tagging-agent` (39
 * records); these are not tagging output and must not be swept up by a query for it.
 */
const PORTING_AGENT = 'ledger-pass'

/**
 * Version stamp on the derived notes. Dated rather than numbered, because what a reader
 * needs from a caveat is *when it was true*, not which pass wrote it.
 * [n=1] — chosen here.
 */
const PORTING_AGENT_VERSION = '2026-08-04'

/**
 * This file is its own source document: it holds the transcription, so the `itemId`
 * anchor points at it rather than at a markdown file that would have to be invented to
 * receive the quotes. A citation that points at a document nobody wrote is the
 * `decision-dangling` shape the loose-end ledger calls a sharper defect than no citation
 * at all.
 */
const SOURCE_DOC = 'research/v3/data/decisions/port-chat-rulings-2026-08-04.ts'

interface Observation {
	/** Stable key inside this document — the ruling's short name. Never a positional index. */
	key: string
	/** The reviewer's words, with the minimum framing they need to stand alone. */
	text: string
}

/**
 * The reviewer's conversational rulings of 2026-08-04, in the order they were relayed.
 *
 * Scope note, and it is the important one: this is **not** the whole of what the reviewer
 * ruled that day. It is the subset relayed to this pass *inside quotation marks*. The
 * toolbox adjudication settled forty-odd items and most of its dispositions arrived as
 * dispositions ("build", "drop", "defer"), not as sentences — those are recorded as
 * decisions with an empty `fundedBy`, which is the honest shape and the reason the field
 * exists.
 */
const OBSERVATIONS: Observation[] = [
	// --- endorsement-recheck-1, resolved in chat rather than in the round ----------
	{
		key: 'endorsement-recheck-1-chat-ruling',
		text:
			'On `endorsement-recheck-1`, overriding the answers given inside the round: ' +
			'"ignore my review of endorsement-recheck, the rule is right in both cases — ' +
			'item 1: foreground and accent *are too close* — item 2: accent on surface *is unreadable*"',
	},

	// --- dropped-colors-1, stopped mid-round and resolved in chat ------------------
	{
		key: 'dropped-colors-1-chat-ruling',
		text:
			'On `dropped-colors-1`, after answering part of the round and stopping: ' +
			'"i stopped reviewing, your color maths is fucked, everything i\'ve seen belongs"',
	},

	// --- toolbox adjudication, 2026-08-04 ------------------------------------------
	{
		key: 'toolbox-13-14-algorithm-material',
		text:
			'Toolbox adjudication, on the two proposals this pass carries as items 13 and 14, ' +
			'declining to have them pre-built as instruments: they are ' +
			'"part of the algorithm, not tooling".',
	},
	{
		key: 'toolbox-15-areas-do-not-matter-in-phase-0',
		text:
			'Toolbox adjudication, on scoping the constant-provenance work per area: the ' +
			'research and instrument areas "don\'t really matter in phase 0".',
	},
	{
		key: 'toolbox-16-not-possible',
		text: 'Toolbox adjudication, dropping the proposal this pass carries as item 16: "not possible".',
	},
	{
		key: 'toolbox-35-answer-timestamps-mean-nothing',
		text:
			'Toolbox adjudication, on whether answer timestamps may be used for anything — ' +
			'stronger than the question asked, and against the proposal on the table: ' +
			'"breaks make times meaningless".',
	},

	// --- the round-kit feedback channels, requested 2026-08-04 ---------------------
	{
		key: 'round-kit-feedback-channels',
		text:
			'Asking for a standing feedback channel on every round: ' +
			'"the review UI should either — have an optional free text box on every item in a ' +
			'batch — have IDs that I can copy paste to you to give feedback about a specific ' +
			'item in a batch. i often want to give feedback about a specific thing and we ' +
			'currently have no way of doing that, which prevents accidental discovery of ' +
			'information."',
	},
]

/**
 * The in-round answers whose standing the chat ruling changed, and the caveat each gets.
 *
 * `itemId` is the released item id from `endorsement-recheck-1` plus an anchor, so the
 * caveat is greppable from the item it annotates and cannot be mistaken for a second
 * answer to it.
 */
interface Caveat {
	/** Released item id in `endorsement-recheck-1`. */
	item: string
	/**
	 * Anchor describing what the chat did to this answer. It is part of the idempotency key,
	 * so getting it wrong and correcting it appends a new note rather than silently editing
	 * one — which is what happened here: the first pass at this port filed BOTH items under
	 * `superseded-by-chat-2026-08-04`, and item 2's in-round answer was not superseded at all.
	 * See the note on `CAVEATS` below.
	 */
	anchor: string
	text: string
}

/**
 * **Read the two entries below as a pair; they are not the same event.**
 *
 * The round asked, of two endorsed palettes the 2026-08-04 metric ruling newly fails,
 * whether the endorsement should stand. Item 1 was answered `keep_the_endorsement` — the
 * reviewer defended the palette against the rule. Item 2 was answered `the_rule_is_right`
 * — the reviewer agreed with the rule already, in the round.
 *
 * The chat ruling then said the rule is right in **both** cases. So:
 *
 * - **item 1 was overridden.** Its answer is superseded by the chat.
 * - **item 2 was confirmed.** Its answer already agreed, and calling it "superseded" would
 *   invent a reversal that never happened and make the reviewer look inconsistent.
 *
 * Both endorsements are retired as quality evidence, which is the consequence people will
 * remember; only one answer moved, which is the fact the log has to keep straight.
 */
const CAVEATS: Caveat[] = [
	{
		item: 'recheck-e7c9419abc1df0dd',
		anchor: 'superseded-by-chat-2026-08-04',
		text:
			'SUPERSEDED BY A CHAT RULING, 2026-08-04. The reviewer re-answered this item in ' +
			'conversation and the chat answer is canonical: the 2026-08-04 metric ruling is ' +
			'right here, foreground and accent on this palette ARE too close, and the ' +
			'endorsement is retired as quality evidence. The in-round answer stands in the log ' +
			'as what was said at the time and is not withdrawn. Why it moved: the item was ' +
			'answered while the explanation of what the rule was objecting to was not visible ' +
			'on the page, so the round asked the reviewer to defend an endorsement without ' +
			'showing them the charge against it.',
	},
	{
		item: 'recheck-22e959d5164750bd',
		anchor: 'confirmed-by-chat-2026-08-04',
		text:
			'CONFIRMED BY A CHAT RULING, 2026-08-04 — not superseded. The in-round answer here ' +
			'was already `the_rule_is_right`, and the chat ruling agrees with it: the accent on ' +
			'surface IS unreadable. Nothing about this answer moved. What DID change is the ' +
			'standing of the palette it is about: the endorsement is retired as quality ' +
			'evidence, so no gate and no adjudication run may count a match to it as a win.',
	},
]

/** The `itemId` value for a reviewer note — this document plus the ruling key. */
export function noteItemId(observation: Observation): string {
	return `${SOURCE_DOC}#${observation.key}`
}

/** The `itemId` value for a derived caveat — the annotated item plus a fixed anchor. */
export function caveatItemId(caveat: Caveat): string {
	return `${caveat.item}#${caveat.anchor}`
}

export function noteInput(observation: Observation): RecordInput<NoteRecord> {
	return {
		type: 'note',
		author: { kind: 'human', id: REVIEWER_ID },
		batch: null,
		itemId: noteItemId(observation),
		artwork: null,
		text: observation.text,
		tags: [],
		derived: null,
	}
}

export function caveatInput(caveat: Caveat, fromRecordId: string): RecordInput<NoteRecord> {
	return {
		type: 'note',
		author: { kind: 'agent', id: PORTING_AGENT },
		batch: null,
		itemId: caveatItemId(caveat),
		artwork: null,
		text: caveat.text,
		tags: [],
		derived: { fromRecordId, agent: PORTING_AGENT, agentVersion: PORTING_AGENT_VERSION },
	}
}

/** Item ids of every note already in the log, derived or not — the idempotency key set. */
export function existingItemIds(file: string): Set<string> {
	const ids = new Set<string>()
	for (const record of readAll(file)) {
		if (record.type !== 'note') continue
		if (record.itemId !== null) ids.add(record.itemId)
	}
	return ids
}

/** Record id of an already-ported reviewer note, so a re-run can still link the caveats. */
function findNoteId(file: string, itemId: string): string | null {
	for (const record of readAll(file)) {
		if (record.type === 'note' && record.itemId === itemId) return record.id
	}
	return null
}

/** The ruling the caveats are derived from. */
const CAVEAT_SOURCE_KEY = 'endorsement-recheck-1-chat-ruling'

function main(argv: string[]): number {
	const { values } = parseArgs({
		args: argv,
		options: { file: { type: 'string' }, 'dry-run': { type: 'boolean' } },
		allowPositionals: false,
	})
	const file = (values.file as string | undefined) ?? DEFAULT_WAREHOUSE_PATH
	const dryRun = values['dry-run'] === true

	const already = existingItemIds(file)
	let appended = 0
	let skipped = 0

	for (const observation of OBSERVATIONS) {
		const itemId = noteItemId(observation)
		if (already.has(itemId)) {
			skipped++
			process.stdout.write(`skip   ${itemId}\n`)
			continue
		}
		if (dryRun) {
			appended++
			process.stdout.write(`would  ${itemId}\n`)
			continue
		}
		const record = append<NoteRecord>(file, noteInput(observation))
		already.add(itemId)
		appended++
		process.stdout.write(`append ${record.id}  ${itemId}\n`)
	}

	// The caveats are derived from the endorsement-recheck ruling, so that note must exist
	// first. On a dry run it does not, and the link is reported as pending rather than faked.
	const sourceItemId = `${SOURCE_DOC}#${CAVEAT_SOURCE_KEY}`
	const sourceId = dryRun ? null : findNoteId(file, sourceItemId)
	if (!dryRun && sourceId === null) {
		process.stderr.write(`port: cannot find the ruling note ${sourceItemId}; caveats not written\n`)
		return 1
	}

	for (const caveat of CAVEATS) {
		const itemId = caveatItemId(caveat)
		if (already.has(itemId)) {
			skipped++
			process.stdout.write(`skip   ${itemId}\n`)
			continue
		}
		if (dryRun) {
			appended++
			process.stdout.write(`would  ${itemId}  (derived from ${sourceItemId})\n`)
			continue
		}
		const record = append<NoteRecord>(file, caveatInput(caveat, sourceId as string))
		already.add(itemId)
		appended++
		process.stdout.write(`append ${record.id}  ${itemId}\n`)
	}

	process.stderr.write(
		`notes=${OBSERVATIONS.length} caveats=${CAVEATS.length} appended=${appended} skipped=${skipped}` +
			`${dryRun ? ' (dry run)' : ''}\n`,
	)
	return 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	process.exitCode = main(process.argv.slice(2))
}
