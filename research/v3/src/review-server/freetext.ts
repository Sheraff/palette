/**
 * Free-text rounds — one artwork, one open question, no vocabulary at all.
 *
 * **Why this instrument exists.** Every other reviewer round in this server hands the reviewer a
 * closed list and asks them to pick. That is the right shape when the list covers the ground, and it
 * is the wrong shape at exactly the moment it does not — because a closed list has no way to say
 * "none of these, and here is why". It has only a refusal value, and a refusal value records the
 * reviewer's silence as if it were their judgement.
 *
 * The cascade round (`cascade-ground-truth-1`) hit that wall. On nine covers the reviewer answered
 * `none_discernible`, and then said what the answer actually meant (verbatim, 2026-08-03):
 *
 *   "some images are *genuinely hard* to rank, and none of the options fit, or maybe several. So I
 *   answered 'none discernible' but this is not true, i can see the field, I just don't know how to
 *   tag it. it you show me the images with a free text field, i can try to explain for each of them,
 *   and that might give us some insight."
 *
 * So `none_discernible` on those nine rows is not a perception ("I see no ground"). It is a
 * vocabulary failure ("I see it and your words do not fit it"), and the two are opposite facts
 * wearing the same token. This round separates them, and it is the only instrument here that can:
 * REVIEW_UI.md §4 makes free text the primary and only required channel precisely because the tags
 * are supposed to be *derived from* the prose afterwards, never the other way round.
 *
 * **What it deliberately does not do.** It offers no vocabulary, not even an enriched one. A longer
 * list would measure whether the reviewer accepts new words; it cannot find out which words are
 * missing, because the reviewer can only choose among what is shown. It does not ask them to defend
 * or revisit the cascade answer either — that answer is shown as CONTEXT, labelled as such, because
 * "why did no tag fit" is unanswerable without knowing which tag they reached for. Anything reading
 * as "you got this wrong, try again" would elicit a correction instead of an explanation, and the
 * explanation is the entire product of the round.
 *
 * **Why the round is an oracle-validation fixture and the records are `oracle-label`.**
 * `NoteRecord` is the shape REVIEW_UI.md §4 designs for raw reviewer prose, and it was the first
 * choice. It is not used, for one measured reason: the warehouse status CLI counts a batch's
 * `reviewed` from standing verdicts, vetoes and oracle-labels only (`warehouse.ts` `batchSummaries`)
 * — a `note` contributes nothing. A round stored as notes would report `reviewed=0`,
 * `pending=9` forever, released or not. That is precisely the class of bug the `labelUnit` fix
 * removed on 2026-08-03, and reintroducing it in a new round to satisfy a type preference would be
 * trading a real instrument fault for a tidy one.
 *
 * So the answer is an `oracle-label` carrying **an explicit free-text schema marker**:
 * `labelSchemaVersion` is `FREETEXT_LABEL_SCHEMA_VERSION`, which exists to announce that this row's
 * `answer` is prose drawn from an OPEN value space, not a token from a closed one. Anything joining
 * or tabulating `answer` values must check the schema version first — which is the same rule every
 * other consumer of these rows already follows, because a `group-a.v2` answer and a `group-bcde.v1`
 * answer were never comparable either. The round then inherits, unchanged and already tested,
 * everything the closed rounds have: push-time custody checks, opaque per-item tokens, supersession
 * on re-answer, resumability across a restart, the dashboard row, release, and `verify-live`.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { DEFAULT_WAREHOUSE_PATH } from "../warehouse/cli.ts"
import type { WarehouseRecord } from "../warehouse/records.ts"
import { readAll, resolve } from "../warehouse/warehouse.ts"
import {
	PREMISE_DISAMBIGUATION_FIXTURE_VERSION,
	validateFixture,
	type OracleValidationFixture,
	type OracleValidationItem,
} from "./oracle-validation.ts"

/** The round whose `none_discernible` answers this one exists to explain. */
export const CASCADE_BATCH_ID = "cascade-ground-truth-1"

export const GROUND_FREETEXT_BATCH_ID = "ground-freetext-1"

export const GROUND_FREETEXT_FIXTURE_PATH = fileURLToPath(new URL("../../data/oracle-validation/ground-freetext-1.json", import.meta.url))

/**
 * The marker that says "this row's `answer` is prose, not a token".
 *
 * It is a `labelSchemaVersion` rather than a new field because that is the column every consumer of
 * an `oracle-label` already reads before comparing anything — the whole point of the field is that
 * two rows are only comparable when it matches. A tabulation that groups by `answer` without looking
 * at it was already broken across the closed schemas; this makes the breakage loud instead of
 * subtle, because the values are sentences.
 * [REVIEWED] — coordinator's brief, 2026-08-03: "an oracle-label variant with an explicit free-text
 * schema marker".
 */
export const FREETEXT_LABEL_SCHEMA_VERSION = "ground-freetext.v1"

/** The one question this round asks. One `questionKey`, so the status CLI keys items by image. */
export const GROUND_FREETEXT_QUESTION_KEY = "ground_freetext"

/**
 * The question, verbatim on every item.
 *
 * Two clauses, deliberately. "What is it" invites the description the vocabulary could not hold;
 * "why did no tag fit" asks for the diagnosis, which is the part no closed round can ever collect.
 * Asking only the first would produce nine descriptions and no account of the gap.
 * [REVIEWED] — coordinator's brief, 2026-08-03, from the reviewer's own request.
 */
export const GROUND_FREETEXT_PROMPT = "Describe the ground/background in your own words — what is it, and why did no tag fit?"

/**
 * The standing instruction, on screen for every item.
 *
 * It says out loud that there is no right answer, because a reviewer who suspects there is one
 * writes to it. "As long or as short as you like" is not politeness — an unbounded field with no
 * stated floor reads as a demand for an essay, and there are nine of these to write.
 * [REVIEWED] — REVIEW_UI.md §4 (free text is the primary channel) and §3 ("no timing of the reviewer").
 */
export const GROUND_FREETEXT_INSTRUCTION =
	"No list this time, and no right answer. Say what you see in your own words — as long or as short as you like."

/**
 * How the reviewer's earlier answer is introduced.
 *
 * The wording carries the whole risk of the round. Shown without a frame, a previous answer reads as
 * something to defend or to recant, and either way the reviewer writes a justification instead of a
 * description. This says what it is for — you reached for this word, tell me why it did not fit —
 * and says explicitly that it is not being challenged.
 * [REVIEWED] — coordinator's brief, 2026-08-03: "clearly labeled as context not something to defend".
 */
export const GROUND_FREETEXT_CONTEXT_LABEL = "Context, not a question — in the cascade round you answered:"

export const GROUND_FREETEXT_CONTEXT_NOTE =
	"Nothing here is being challenged and nothing needs correcting. It is shown so you can say why that word was the closest one available."

/**
 * An answer shorter than this, once trimmed, is a slip rather than a description.
 *
 * A property of the free-text MODE, not of this round: any round that asks an open question needs a
 * floor, because an empty string and "I see no ground" are different answers and the field cannot
 * tell them apart. Deliberately tiny — the floor exists to catch a stray Enter, not to demand an
 * essay (REVIEW_UI.md §3: no timing of the reviewer).
 * [n=1] — this round's floor, the first of its kind.
 */
export const FREETEXT_MIN_LENGTH = 2

export const GROUND_FREETEXT_SELECTION_RULE =
	"Exactly the covers where the cascade round's reviewer answer was `none_discernible` and the " +
	"reviewer has since said the token meant a vocabulary failure rather than a perception — " +
	"`cascade-ground-truth-1-analysis.json` `verdict.vocabulary_misfit_covers`, 9 covers. Every item " +
	"row (path, hash, rendition, stratum) is reused VERBATIM from `cascade-ground-truth-1.json`, so a " +
	"free-text answer is about the same bytes the closed-vocabulary answer was about; rebuilding the " +
	"rows from the corpus would risk a rendition drift that would make the two incomparable. The " +
	"round asks one open question per cover and offers no vocabulary at all, because a longer list " +
	"would measure whether the reviewer accepts new words rather than which words are missing."

type CascadeFixture = Readonly<{ batchId: string; labelSchemaVersion: string; items: readonly OracleValidationItem[] }>

type CascadeAnalysis = Readonly<{
	verdict: Readonly<{ vocabulary_misfit_covers: Readonly<{ artworkIds: readonly string[]; imagePaths: readonly string[] }> }>
}>

/**
 * Build the round from the cascade round's own fixture and verdict.
 *
 * The prior answer is joined on **sha256**, never on `imageId`. The two sides spell some ids
 * differently — the warehouse records carry `…653121.jpg` where the verdict lists `00014fb4…` — and
 * an id join would silently drop those covers or, worse, hang the wrong reviewer answer on a cover.
 * The content hash is the one key both sides agree on (CONVENTIONS.md: identify artworks by full
 * path + content hash, never by id prefix).
 *
 * `priorAnswers` is passed in rather than read from the warehouse here, so this stays a pure
 * function of its inputs and the server keeps sole ownership of warehouse reads.
 */
export async function buildGroundFreetextFixture(options: {
	/** sha256 → the reviewer's standing cascade answer for that artwork. */
	priorAnswers: ReadonlyMap<string, string>
	cascadeFixturePath?: string
	cascadeAnalysisPath?: string
	batchId?: string
}): Promise<OracleValidationFixture> {
	const cascadeFixturePath =
		options.cascadeFixturePath ?? fileURLToPath(new URL("../../data/oracle-validation/cascade-ground-truth-1.json", import.meta.url))
	const cascadeAnalysisPath =
		options.cascadeAnalysisPath ?? fileURLToPath(new URL("../../data/oracle-premise/cascade-ground-truth-1-analysis.json", import.meta.url))
	const cascade = JSON.parse(await readFile(cascadeFixturePath, "utf8")) as CascadeFixture
	const analysis = JSON.parse(await readFile(cascadeAnalysisPath, "utf8")) as CascadeAnalysis
	const misfit = analysis.verdict.vocabulary_misfit_covers
	const byPath = new Map(cascade.items.map((item) => [item.imagePath, item]))

	const items: OracleValidationItem[] = []
	for (const imagePath of misfit.imagePaths) {
		const source = byPath.get(imagePath)
		if (source === undefined) throw new Error(`${cascade.batchId} never showed ${imagePath}; the verdict and the fixture disagree`)
		const prior = options.priorAnswers.get(source.sha256)
		if (prior === undefined) {
			throw new Error(`no cascade answer for ${imagePath}; the context line would be blank on a round that exists to explain it`)
		}
		items.push({
			...source,
			// Named from the content hash, like every other fixture here, so the id is reproducible from
			// the bytes and cannot collide with the cascade round's own `cg-` ids.
			itemId: `gf-${source.sha256.slice(0, 12)}`,
			questionKey: GROUND_FREETEXT_QUESTION_KEY,
			priorAnswer: { batchId: cascade.batchId, questionKey: "ground_type", answer: prior },
		})
	}

	const fixture: OracleValidationFixture = {
		fixtureVersion: PREMISE_DISAMBIGUATION_FIXTURE_VERSION,
		batchId: options.batchId ?? GROUND_FREETEXT_BATCH_ID,
		purpose: "oracle-validation",
		labelSchemaVersion: FREETEXT_LABEL_SCHEMA_VERSION,
		seed: 0,
		generatedBy: "research/v3/src/review-server/freetext.ts",
		builtFrom: [
			"research/v3/data/oracle-validation/cascade-ground-truth-1.json",
			"research/v3/data/oracle-premise/cascade-ground-truth-1-analysis.json",
		],
		selection: {
			rule: GROUND_FREETEXT_SELECTION_RULE,
			counts: { misfit_covers: misfit.imagePaths.length, items: items.length },
		},
		questions: [
			{
				key: GROUND_FREETEXT_QUESTION_KEY,
				kind: "freetext",
				question: GROUND_FREETEXT_PROMPT,
				instruction: GROUND_FREETEXT_INSTRUCTION,
				contextLabel: GROUND_FREETEXT_CONTEXT_LABEL,
				contextNote: GROUND_FREETEXT_CONTEXT_NOTE,
				// Empty, and that IS the instrument. A free-text question with one option would be a
				// closed question with extra steps.
				answers: [],
			},
		],
		items,
		// NOT shuffled, and `seed: 0` records that no shuffle was applied rather than leaving the field
		// to imply one. Every closed round here randomizes serve order because a single-token answer is
		// susceptible to order effects. Here the reviewer writes prose and may well want to say "the
		// third one, like the first" — a stable order is what makes that sentence usable, and there is
		// no closed answer for an order effect to bias.
		serveOrder: items.map((item) => item.itemId),
	}
	return fixture
}

/**
 * The reviewer's STANDING cascade answer per artwork, keyed by content hash.
 *
 * Standing, not first: `artofficial.jpg` carries two answers in the log — `full_scene`, then
 * `none_discernible` — and the context line must show the one that stands, or the round asks the
 * reviewer why a word they had already moved away from did not fit.
 */
export function standingCascadeAnswers(records: readonly WarehouseRecord[], batchId: string): Map<string, string> {
	const standing = new Map<string, string>()
	for (const entry of resolve(records)) {
		if (entry.record.type !== "oracle-label" || entry.retracted) continue
		const label = entry.record
		if (label.batch?.id !== batchId || label.author.kind !== "human") continue
		const sha = label.artwork?.sha256
		if (sha === undefined || typeof label.answer !== "string") continue
		// Last one wins, by file order — the same rule every other reader of these rows uses.
		standing.set(sha, label.answer)
	}
	return standing
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			warehouse: { type: "string" },
			cascade: { type: "string" },
			analysis: { type: "string" },
			batch: { type: "string" },
			out: { type: "string" },
		},
		strict: true,
	})
	const warehousePath = values.warehouse ?? DEFAULT_WAREHOUSE_PATH
	const fixture = await buildGroundFreetextFixture({
		priorAnswers: standingCascadeAnswers(readAll(warehousePath), CASCADE_BATCH_ID),
		cascadeFixturePath: values.cascade,
		cascadeAnalysisPath: values.analysis,
		batchId: values.batch,
	})
	validateFixture(fixture)
	const outPath = values.out ?? GROUND_FREETEXT_FIXTURE_PATH
	await mkdir(dirname(outPath), { recursive: true })
	await writeFile(outPath, serializeFreetextFixture(fixture))
	process.stdout.write(`${fixture.batchId}: ${fixture.items.length} items, one open question, no vocabulary\n`)
	for (const item of fixture.items) {
		process.stdout.write(`  ${item.imagePath} — you answered: ${item.priorAnswer?.answer}\n`)
	}
	process.stdout.write(`\nwrote ${outPath}\n`)
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
	await main()
}

/** Serialize a fixture the way every other fixture in this directory is written: tabs, trailing newline. */
export function serializeFreetextFixture(fixture: OracleValidationFixture): string {
	return `${JSON.stringify(fixture, null, "\t")}\n`
}
