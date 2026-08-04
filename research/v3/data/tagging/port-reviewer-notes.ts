/**
 * Port the reviewer's conversational observations into the warehouse as `note` records.
 *
 * Phase 0 collected a number of reviewer observations in conversation and parked them in
 * workstream markdown files with a promise: "to be ported into the warehouse as note
 * records once the tagging flow exists" (`data/embeddings/GALLERY_NOTES.md`). The flow
 * exists, so this script keeps the promise.
 *
 * What it writes: one `note` record per observation, carrying the reviewer's words as
 * `text`, `tags: []` (raw notes are never pre-tagged — the tagging pass is what assigns
 * tags, and a hand-tagged raw note would be an un-droppable index; TAGGING_PROTOCOL.md
 * §1), `author { kind: 'human', id: REVIEWER_ID }`, `derived: null` (this is raw reviewer
 * text, not derived from another record), `batch: null` and `artwork: null` — these are
 * observations about instruments and about the question set, not about one batch item or
 * one artwork.
 *
 * Where the source document goes: `itemId`. A batch-less note has no item, and `itemId`
 * is the only free string slot on the record that is not the reviewer's own words. The
 * value is `<repo-relative doc path>#<observation key>`, which is also the idempotency
 * key — re-running this script appends nothing, because a note with that `itemId`
 * already exists. This is deliberately the same shape the tagging tools use for
 * identity: a stable, greppable string, never a positional index into the log.
 *
 * Usage:
 *   node --experimental-strip-types research/v3/data/tagging/port-reviewer-notes.ts [--dry-run] [--file <warehouse.jsonl>]
 *
 * This script does not modify warehouse source. It uses the warehouse library's public
 * `append`/`readAll` only.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import type { NoteRecord, RecordInput } from '../../src/warehouse/records.ts'
import { append, readAll } from '../../src/warehouse/warehouse.ts'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Live warehouse file. Same path as `src/tagging/export-untagged.ts`
 * `DEFAULT_WAREHOUSE_PATH`.
 * [REVIEWED] — storage location fixed by the Phase 0 warehouse workstream.
 */
const DEFAULT_WAREHOUSE_PATH = join(HERE, '..', 'warehouse', 'warehouse.jsonl')

/**
 * Author id for the reviewer. Must match the id already on every human record in the
 * warehouse, or a query for "everything the reviewer said" silently splits in two.
 * [MEASURED] — all 495 pre-existing warehouse records carry `author.id = "flo"`.
 */
const REVIEWER_ID = 'flo'

interface Observation {
	/** Repo-relative source document. */
	doc: string
	/** Stable key inside the document — the numbered observation, or the appendix bullet. */
	key: string
	/** The reviewer's words. Verbatim quotes are quoted; framing outside the quotes is the source document's. */
	text: string
}

/**
 * The observations, in document order.
 *
 * Rule followed for `text`: everything inside double quotes is the reviewer verbatim, as
 * transcribed in the source document. Text outside the quotes is the minimum framing the
 * quote needs to stand alone, taken from the source document's own wording. Orchestrator
 * implications and consequences recorded alongside the quotes in those documents are
 * **not** ported — they are not the reviewer's words, and the note record's job is to
 * hold the human channel.
 * [REVIEWED] — the source documents are the reviewer's own review rounds.
 */
const OBSERVATIONS: Observation[] = [
	// --- embedding gallery browse, 2026-08-02 -------------------------------------
	{
		doc: 'research/v3/data/embeddings/GALLERY_NOTES.md',
		key: 'obs-1',
		text:
			'Embedding gallery browse, on PE-Core-L14: it matches by artist, not by image. ' +
			'"Seems to consider \'close\' artworks when they are by the same artist, even if the ' +
			"images themselves don't look much alike (happens for toxicity, johns, krafty, muse, " +
			"infected). For some of them it could be the band's logo that is the same, for others " +
			"it might be the textual content that is the same (band's name), or it has deep " +
			'knowledge of music artworks."',
	},
	{
		doc: 'research/v3/data/embeddings/GALLERY_NOTES.md',
		key: 'obs-2',
		text:
			'Embedding gallery browse, DINOv2 vs DINOv3 attend to different structure: ' +
			'"For krafty, DINOv2 focused on the layout and flowers, while DINOv3 seems to have ' +
			'focused more on the strong typography."',
	},
	{
		doc: 'research/v3/data/embeddings/GALLERY_NOTES.md',
		key: 'obs-3',
		text:
			'Embedding gallery browse, DINOv3 sometimes matches semantic category across styles: ' +
			'"For the boat in johns -> a picture of a boat, a painting of a boat, a logo of a boat, ' +
			'a drawing of an origami boat, all in different styles but all boats."',
	},
	{
		doc: 'research/v3/data/embeddings/GALLERY_NOTES.md',
		key: 'obs-4',
		text: 'Embedding gallery browse, overall: "I think the DINO models are better, but I wouldn\'t know which one of the 2."',
	},

	// --- SAM mask-quality round 1, 2026-08-03 -------------------------------------
	{
		doc: 'research/v3/data/sam/MASK_REVIEW_NOTES.md',
		key: 'obs-1',
		text:
			'SAM mask review: "sometimes \'logo\' could be part of the artwork itself, or some sort ' +
			'of added branding" — and likewise "sticker": part of the artwork, or something added on top.',
	},
	{
		doc: 'research/v3/data/sam/MASK_REVIEW_NOTES.md',
		key: 'obs-2',
		text:
			'SAM mask review: "i did not count \'parental advisory\' marks as \'stickers\' but the ' +
			'model seemed to consider them as stickers."',
	},
	{
		doc: 'research/v3/data/sam/MASK_REVIEW_NOTES.md',
		key: 'obs-3',
		text: 'SAM mask review, on faces firing on depicted faces: "a graffiti of a face", "a sculpted bust".',
	},
	{
		doc: 'research/v3/data/sam/MASK_REVIEW_NOTES.md',
		key: 'obs-4',
		text: 'SAM mask review: "a chinese character was recognized as a word (not incorrect, just interesting)".',
	},
	{
		doc: 'research/v3/data/sam/MASK_REVIEW_NOTES.md',
		key: 'obs-5',
		text:
			'SAM mask review: album-title masks sometimes ambiguous between the title and the ' +
			'artist name — "definitely some of the main text".',
	},
	{
		doc: 'research/v3/data/sam/MASK_REVIEW_NOTES.md',
		key: 'obs-6',
		text:
			'SAM mask review, on the overlay rendering (mask fill + bbox + locator ring): "the ' +
			"three-layer rendering was helpful in some cases, i just got confused the first time that's all.\"",
	},

	// --- oracle question set, Appendix R ------------------------------------------
	{
		doc: 'research/v3/ORACLE_QUESTION_SET.md',
		key: 'appendix-r-1',
		text:
			'Premise disambiguation round, canonical ruling: ground_type has a gap for "one flat ' +
			'field + one shaded field with a blurry meeting line". The test is surface identity, ' +
			'never boundary softness — one surface partly flat / partly shaded is shaded_field; ' +
			'two areas with a soft join are multiple_distinct_fields; genuine 5-second ambiguity ' +
			'is answered on the gut read, because the forced choice has to be symmetric with the VLM\'s.',
	},
	{
		doc: 'research/v3/ORACLE_QUESTION_SET.md',
		key: 'appendix-r-2',
		text:
			'Premise disambiguation round, second canonical ruling: one wall painted in bands that ' +
			'melt into each other is shaded_field — the contract\'s genuine three-stop gradient ' +
			'case; the same wall in crisp bands is multiple_distinct_fields. The axis is whether ' +
			'the ground reads as one continuous color progression or as discrete color areas; ' +
			'surface identity is a strong prior, neither necessary nor sufficient.',
	},
	{
		doc: 'research/v3/ORACLE_QUESTION_SET.md',
		key: 'appendix-r-3',
		text:
			'Adjudication browse: the published gradient flag is palette-conditional, not an ' +
			'artwork label. "The flat/gradient flag might not be the most fair comparison since it ' +
			'can really depend on which colors were picked for background/surface too." An artwork ' +
			'can support a valid flat palette and a valid gradient palette; the flag records which ' +
			'choice won. The reviewer also reported that where they voted differently from the ' +
			'oracle, they could see its point of view.',
	},

	// --- residual purity round 1, post-release, 2026-08-04 --------------------------
	// One paragraph of post-release prose, split at its own sentence boundary so the
	// ornament policy and the escape-answer request can be cited separately.
	// Transcription of record: `data/sam/residual-purity-1-analysis.json` →
	// `reviewerFeedback.verbatim`. The same words are quoted in
	// `oracle/sam/RESIDUAL_PURITY_VERDICT.md`, the reviewer-facing round document,
	// which is therefore the `doc`.
	{
		doc: 'research/v3/oracle/sam/RESIDUAL_PURITY_VERDICT.md',
		key: 'post-release-misses',
		text:
			'Residual purity round 1, post-release, on what survived subtraction: ' +
			'"objects that were not masked out during the everything-but-the-masks round — a flame — ' +
			'some residual text — a cello — decorations above/below the main text (that would be ' +
			'considered part of the main text)."',
	},
	{
		doc: 'research/v3/oracle/sam/RESIDUAL_PURITY_VERDICT.md',
		key: 'post-release-escape',
		text:
			'Residual purity round 1, post-release, on the answer set the round offered: ' +
			'"sometimes it\'s hard to tell what is field and what is subject, so answers for those ' +
			'cases are not reliable (even with human feedback) unless we add an escape answer choice."',
	},

	// --- pointing-ground-1, disclosed after answering, 2026-08-04 -------------------
	// The criterion the reviewer actually applied, disclosed after the batch completed.
	// Byte-identical in `data/sam/pointing-ground-1-analysis.json` →
	// `reviewer_disclosure.verbatim` and in `oracle/sam/POINTING_PROBE_NOTES.md` §13.2.
	{
		doc: 'research/v3/oracle/sam/POINTING_PROBE_NOTES.md',
		key: 'pointing-ground-1-lenience',
		text:
			'Pointing round `pointing-ground-1`, disclosed after answering: ' +
			'"i reviewed the pointing-ground-1 set, since it ran on mostly \'extremely hard ' +
			"background' artworks, i answered as 'could this be considered correct' and not 'is this " +
			'correct\', results might be way better in other artworks but here it wasn\'t amazing."',
	},
]

/** The `itemId` value for an observation — source document plus observation key. */
export function noteItemId(observation: Observation): string {
	return `${observation.doc}#${observation.key}`
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

/** Item ids of every raw (non-derived, non-retracted-by-construction) note already in the log. */
export function existingItemIds(file: string): Set<string> {
	const ids = new Set<string>()
	for (const record of readAll(file)) {
		if (record.type !== 'note') continue
		if (record.derived !== null) continue
		if (record.itemId !== null) ids.add(record.itemId)
	}
	return ids
}

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

	process.stderr.write(
		`observations=${OBSERVATIONS.length} appended=${appended} skipped=${skipped}${dryRun ? ' (dry run)' : ''}\n`,
	)
	return 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	process.exitCode = main(process.argv.slice(2))
}
