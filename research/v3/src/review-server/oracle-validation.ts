/**
 * Oracle-validation mode: the human-labeling pass that validates the VLM oracle (REVIEW_UI.md §6).
 *
 * An item is the simplest thing this campaign can ask a human: **one artwork, one question, one
 * closed answer vocabulary**. Items are served in **by-question passes** — every artwork under
 * question 1, then every artwork under question 2 — because the alternative (a form per artwork)
 * pays a context switch on every answer, and §6's whole design target is the 5-second answer.
 *
 * This file holds the mode's vocabulary and its fixtures. The serving, the records and the release
 * live in `server.ts`; the page lives in `../../review-ui/oracle.{html,js}`.
 *
 * The first batch is the **premise-test disambiguation round**. The premise test
 * (`research/v3/oracle/premise/`) compared the VLM's `ground_type` against the gradient boolean on
 * accepted palettes and sorted every pair into agreement / contradiction / can't-tell. On the
 * contradictions the two sources disagree and neither is a human looking at the artwork and
 * answering the question. This round is that human. Its output decides the premise verdict, so the
 * one thing it must not do is show the reviewer either side's answer.
 *
 * Regenerate the committed fixture:
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *     research/v3/src/review-server/oracle-validation.ts --write
 */
import { readFileSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { mulberry32 } from "../contract/calibration/same-color-bar-translation.ts"
import { deriveCollection } from "./batch.ts"

/* ------------------------------------------------------------------------------------------- */
/* The mode                                                                                      */
/* ------------------------------------------------------------------------------------------- */

/**
 * Answer-key vocabulary for enum questions.
 *
 * Nine is the ceiling because the keyboard is: `1`–`9` are one keystroke each and `10` is two, which
 * breaks auto-advance. A question that needs more than nine answers is two questions.
 * [REVIEWED] — REVIEW_UI.md §6 ("y/n or 1–5 for enums"), widened to the whole number row.
 */
export const MAX_ENUM_ANSWERS = 9

/** Hotkeys for a boolean question, in the order the mapping is displayed. [REVIEWED] — §6. */
export const BOOLEAN_HOTKEYS = ["y", "n"] as const

/**
 * The digit row, as `keys.js` normalizes it. A `multi` question binds one of these per value.
 *
 * Mirrored here rather than imported: `review-ui/keys.js` is browser code with no type declarations,
 * and a fixture builder that could not check its own hotkeys would be checking nothing.
 * `review-server-bcde-validation.test.ts` asserts the two lists stay equal, so they cannot drift.
 * [INHERITED] — `research/v3/review-ui/keys.js` `DIGIT_ROW`.
 */
export const DIGIT_HOTKEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const

/**
 * What commits a `multi` answer. Two keys, because one of them is always under a thumb.
 *
 * A multi-select cannot auto-advance on the answer keystroke — that is the whole reason the kind
 * exists — so the commit is explicit and it is the only place in this mode where a keystroke is not
 * an answer. Neither key can collide with a vocabulary: `validateFixture` refuses a `multi` question
 * that binds anything but digits.
 * [REVIEWED] — PREMISE_NEXT.md §15.9 option A ("multiple keys toggle, one key commits").
 */
export const MULTI_COMMIT_KEYS = ["enter", " "] as const

/** One offered answer. `key` is what lands in the record, verbatim; the rest is for the human. */
export type OracleAnswerOption = Readonly<{
	/** The closed-vocabulary token recorded on the `oracle-label`. */
	key: string
	/** Short label beside the hotkey in the always-visible mapping. */
	label: string
	/** One line saying what the token means. Same words the oracle was given, where there are any. */
	gloss: string
	/** The single key that selects this answer. */
	hotkey: string
}>

/**
 * How a question is answered.
 *
 * `enum` and `boolean` are one keystroke and auto-advance; `multi` is the array-valued case
 * (PREMISE_NEXT.md §15.9): the digit keys toggle values on and off and an explicit commit key ends
 * the item. It exists because a reviewer cannot pick several answers under a one-keystroke
 * auto-advance UI, and because decomposing a multi-select into per-value yes/no passes would be a
 * different question from the one the model answered.
 */
export type OracleQuestionKind = "enum" | "boolean" | "multi"

export type OracleQuestion = Readonly<{
	/** `questionKey` on every record this question produces, e.g. `ground_type`. */
	key: string
	kind: OracleQuestionKind
	/** The stem, on screen for every item of the pass. */
	question: string
	/**
	 * The standing instruction, on screen for every item of the pass.
	 *
	 * It lives in the fixture and not in the page for the reason the bracketing round learned the
	 * hard way: an answer only means something against the exact words it was answered under, so the
	 * words the reviewer read must travel with the answers.
	 */
	instruction: string
	/**
	 * The referent preamble — what "the background" means — rendered on the page above the question,
	 * on every pass. Carried byte-identically from the prompt file's `referent_preamble`.
	 *
	 * Not optional decoration. v1 of these probes called the background "the large area", a singular
	 * referent, which made four of the six probes unanswerable on a plural background (half sky, half
	 * roof). v1.1 fixes the referent once, here; a reviewer who never sees it is answering v1's
	 * question, not v1.1's.
	 */
	preamble?: string
	/** The unsure framing, likewise on the page above the question. From `unsure_framing`. */
	framing?: string
	answers: readonly OracleAnswerOption[]
}>

export type OracleValidationItem = Readonly<{
	/** Stable id. Server-side only — the browser is given an opaque token instead. */
	itemId: string
	/** Which question this item asks. Items are grouped into passes by this key. */
	questionKey: string
	/** Repo-root-relative path of the exact rendition to serve. Absolute paths are not portable. */
	imagePath: string
	/**
	 * The content hash this fixture was built against. Checked at push time: if the bytes on disk
	 * have changed, the item is not the item the batch was designed around and the push fails loudly.
	 */
	sha256: string
	/** Collection-qualified image id, as the oracle tables use it. */
	imageId: string
	/** Groups renditions of one artwork. Null when unknown. */
	artworkId: string | null
	collection: string
	/** Which rendition is being served, named, because a different rendition is a different item. */
	rendition: Readonly<{
		/** Where the choice of rendition came from, e.g. the eval set that the oracle also ran on. */
		source: string
		/** That source's own id for this row, so the join back is exact. */
		sourceEntryId: string
		longEdgePx: number
		width: number
		height: number
	}>
	/** The stratum this item was drawn from, for per-stratum stopping (§6). */
	stratum: string
}>

export type OracleValidationFixture = Readonly<{
	fixtureVersion: string
	batchId: string
	/** Always `oracle-validation`; carried so the batch's purpose comes from the fixture. */
	purpose: "oracle-validation"
	/**
	 * The question-set schema these answers are comparable under — the **oracle's own**
	 * `schema_version`, not a human-only version. That is the point of the mode: these rows sit in
	 * the same table as the VLM's and are compared row for row. What distinguishes them is
	 * `author.kind === "human"`, never the schema.
	 */
	labelSchemaVersion: string
	seed: number
	generatedBy: string
	/** The files this fixture was derived from, repo-root-relative. */
	builtFrom: readonly string[]
	/** Plain-language statement of who is in this batch and why. No per-item truth. */
	selection: Readonly<{ rule: string; counts: Readonly<Record<string, number>> }>
	questions: readonly OracleQuestion[]
	items: readonly OracleValidationItem[]
	/** Serve order: all of one question, then all of the next; shuffled inside each pass. */
	serveOrder: readonly string[]
}>

/** Structural check. Cheap, and it is the difference between a typo and a corrupted round. */
export function validateFixture(fixture: OracleValidationFixture): void {
	if (fixture.questions.length === 0) throw new Error("an oracle-validation fixture needs at least one question")
	const seenQuestions = new Set<string>()
	for (const question of fixture.questions) {
		if (seenQuestions.has(question.key)) throw new Error(`question ${question.key} appears twice`)
		seenQuestions.add(question.key)
		if (question.answers.length === 0) throw new Error(`question ${question.key} offers no answers`)
		if (question.kind !== "boolean" && question.answers.length > MAX_ENUM_ANSWERS) {
			throw new Error(`question ${question.key} offers more than ${MAX_ENUM_ANSWERS} answers; split it in two`)
		}
		const hotkeys = new Set<string>()
		const answerKeys = new Set<string>()
		for (const answer of question.answers) {
			if (hotkeys.has(answer.hotkey)) throw new Error(`question ${question.key} binds ${answer.hotkey} twice`)
			if (answerKeys.has(answer.key)) throw new Error(`question ${question.key} offers ${answer.key} twice`)
			hotkeys.add(answer.hotkey)
			answerKeys.add(answer.key)
		}
		if (question.kind === "boolean") {
			const expected = [...BOOLEAN_HOTKEYS].join("")
			const got = question.answers.map((answer) => answer.hotkey).join("")
			if (got !== expected) throw new Error(`a boolean question must bind ${expected}, not ${got}`)
		}
		// A multi-select binds digits and nothing else. Two reasons, both load-bearing: the commit key
		// must never be mistakable for a value, and `u` must stay undo — a reviewer part-way through a
		// selection needs a way out that is not an answer.
		if (question.kind === "multi") {
			const strayed = question.answers.filter((answer) => !(DIGIT_HOTKEYS as readonly string[]).includes(answer.hotkey))
			if (strayed.length > 0) {
				throw new Error(
					`multi question ${question.key} binds ${strayed.map((answer) => answer.hotkey).join(", ")}; ` +
						"a multi-select binds digits only, so the commit key and undo stay unambiguous",
				)
			}
		}
	}
	const seenItems = new Set<string>()
	const seenAsked = new Set<string>()
	for (const item of fixture.items) {
		if (seenItems.has(item.itemId)) throw new Error(`item ${item.itemId} appears twice`)
		seenItems.add(item.itemId)
		if (!seenQuestions.has(item.questionKey)) throw new Error(`item ${item.itemId} asks unknown question ${item.questionKey}`)
		// One artwork may be asked several questions — that is what by-question passes are for — but
		// never the same question twice: the server keys an answer by (question, image), and two items
		// sharing that pair would answer each other.
		const asked = `${item.questionKey} ${item.imageId}`
		if (seenAsked.has(asked)) throw new Error(`${item.imageId} is asked ${item.questionKey} twice`)
		seenAsked.add(asked)
	}
	if (fixture.serveOrder.length !== fixture.items.length || new Set(fixture.serveOrder).size !== fixture.items.length) {
		throw new Error("serveOrder must list every item exactly once")
	}
	for (const itemId of fixture.serveOrder) {
		if (!seenItems.has(itemId)) throw new Error(`serveOrder names unknown item ${itemId}`)
	}
	// By-question passes, not by-item forms: the questions must not interleave in the serve order.
	const order = fixture.serveOrder.map((itemId) => fixture.items.find((item) => item.itemId === itemId)!.questionKey)
	const runs: string[] = []
	for (const key of order) if (runs.at(-1) !== key) runs.push(key)
	if (new Set(runs).size !== runs.length) throw new Error("serveOrder interleaves questions; §6 asks for one pass per question")
}

/* ------------------------------------------------------------------------------------------- */
/* Question A1 — ground_type                                                                     */
/* ------------------------------------------------------------------------------------------- */

/**
 * The oracle's question-set schema version. Copied from the premise run's rows
 * (`premise-run-1.jsonl`, `schema_version`), because a human answer is only comparable to a machine
 * answer if both were asked the same question under the same vocabulary.
 * [INHERITED] — `research/v3/oracle/premise/prompts/group-a.variant-{a,b}.json`.
 */
export const ORACLE_LABEL_SCHEMA_VERSION = "group-a.v1"

/**
 * The instruction shown on every item of the `ground_type` pass, verbatim as briefed.
 *
 * It is the founding gradient rule in one sentence — the same distinction both prompt variants put
 * to the VLM ("a surface lit from one side is still ONE area … sky over a field is TWO areas").
 * [REVIEWED] — briefed wording, 2026-08-03.
 */
export const GROUND_TYPE_INSTRUCTION =
	"A gradient means continuous shading within one physical surface — shadows on the same surface. " +
	"The sky and the grass are different areas, not a gradient."

/**
 * `ground_type`, with the exact vocabulary the VLM answered and its own option glosses.
 *
 * Vocabulary and order: `ORACLE_QUESTION_SET.md` group A, reproduced by prompt variant A. The
 * glosses are that prompt's own option descriptions, so neither rater is answering a slightly
 * different question. [INHERITED] — `group-a.variant-a.json`.
 */
export const GROUND_TYPE_QUESTION: OracleQuestion = {
	key: "ground_type",
	kind: "enum",
	question: "The GROUND is the large area behind and around any subject, text or figures. What is it made of?",
	instruction: GROUND_TYPE_INSTRUCTION,
	answers: [
		{ key: "flat_field", label: "flat field", gloss: "one area of essentially one colour, no shading", hotkey: "1" },
		{
			key: "shaded_field",
			label: "shaded field",
			gloss: "one surface whose colour changes smoothly across it (light, shadow, glow, fade)",
			hotkey: "2",
		},
		{
			key: "multiple_distinct_fields",
			label: "multiple distinct fields",
			gloss: "two or more separate areas of different colour meeting at a boundary",
			hotkey: "3",
		},
		{ key: "full_scene", label: "full scene", gloss: "a depicted space with depth: a room, a landscape, a street, a place", hotkey: "4" },
		{
			key: "pattern_or_texture",
			label: "pattern or texture",
			gloss: "a repeating motif or a material surface covering the whole ground",
			hotkey: "5",
		},
		{ key: "none_discernible", label: "none discernible", gloss: "no ground can be made out", hotkey: "6" },
	],
}

/* ------------------------------------------------------------------------------------------- */
/* The premise-test maps, mirrored                                                               */
/* ------------------------------------------------------------------------------------------- */

/**
 * The coarse binary map under test: which `ground_type` labels predict a published gradient.
 * [INHERITED] — verbatim from `research/v3/oracle/premise/analyze.py` `GRADIENT_MAP`. A test asserts
 * it still equals the map recorded in `premise-run-1.agreement.json`, so the two cannot drift.
 */
export const GRADIENT_MAP: Readonly<Record<string, "gradient" | "flat" | "unmapped">> = {
	shaded_field: "gradient",
	flat_field: "flat",
	multiple_distinct_fields: "flat",
	full_scene: "unmapped",
	pattern_or_texture: "unmapped",
	none_discernible: "unmapped",
}

export type P6Bucket = "agreement" | "contradiction_hard" | "contradiction_soft" | "underdetermined"

/**
 * PHASE_0_DECISIONS.md §4 P6 applied cell by cell: (ground_type, published gradient) → bucket.
 * [INHERITED] — verbatim from `analyze.py` `P6_BUCKETS`; cross-checked against the agreement file.
 */
export const P6_BUCKETS: Readonly<Record<string, P6Bucket>> = {
	"flat_field|gradient": "contradiction_hard",
	"flat_field|flat": "agreement",
	"shaded_field|gradient": "agreement",
	"shaded_field|flat": "contradiction_soft",
	"multiple_distinct_fields|gradient": "underdetermined",
	"multiple_distinct_fields|flat": "agreement",
	"full_scene|gradient": "underdetermined",
	"full_scene|flat": "underdetermined",
	"pattern_or_texture|gradient": "underdetermined",
	"pattern_or_texture|flat": "underdetermined",
	"none_discernible|gradient": "underdetermined",
	"none_discernible|flat": "underdetermined",
}

export function p6Bucket(groundType: string, publishedGradient: boolean): P6Bucket {
	return P6_BUCKETS[`${groundType}|${publishedGradient ? "gradient" : "flat"}`] ?? "underdetermined"
}

/**
 * Resolution strata. [INHERITED] — `analyze.py` `tier_of`; the pipeline requires every agreement
 * number to be stratified by tier, because a difference between tiers could be resolution and not
 * content.
 */
export function tierOf(longEdgePx: number): string {
	if (longEdgePx <= 320) return "thumbnail_<=320"
	if (longEdgePx <= 640) return "standard_<=640"
	return "large_>640"
}

/* ------------------------------------------------------------------------------------------- */
/* Batch 1 — the premise-test disambiguation round                                               */
/* ------------------------------------------------------------------------------------------- */

export const PREMISE_DISAMBIGUATION_FIXTURE_VERSION = "oracle-validation-1"
export const PREMISE_DISAMBIGUATION_BATCH_ID = "oracle-premise-disambiguation-1"

/**
 * Seed for the serve-order shuffle. Fixed so the committed fixture is reproducible.
 * [UNCALIBRATED] — the build date, chosen here; any fixed value works.
 */
export const PREMISE_DISAMBIGUATION_SEED = 20260803

export const PREMISE_RUN_PATH = fileURLToPath(new URL("../../data/oracle-premise/premise-run-1.jsonl", import.meta.url))
export const PREMISE_AGREEMENT_PATH = fileURLToPath(
	new URL("../../data/oracle-premise/premise-run-1.agreement.json", import.meta.url),
)
export const PREMISE_EVAL_SET_PATH = fileURLToPath(new URL("../../data/oracle-premise/eval-set.json", import.meta.url))
export const PREMISE_DISAMBIGUATION_FIXTURE_PATH = fileURLToPath(
	new URL("../../data/oracle-validation/premise-disambiguation-1.json", import.meta.url),
)

/** research/v3/src/review-server/ → repository root. Fixture paths are stored relative to it. */
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url))

/**
 * What the eval set is: the reviewed side of the premise test. Named on every item so a later reader
 * knows which rendition was looked at without opening another file.
 */
export const PREMISE_RENDITION_SOURCE = "research/v3/data/oracle-premise/eval-set.json"

export const PREMISE_SELECTION_RULE =
	"Every artwork the premise test bucketed as contradiction_hard or contradiction_soft under EITHER " +
	"prompt variant (A or B), deduplicated across variants. These are the artworks where the oracle's " +
	"ground_type and the accepted palette's gradient boolean cannot both be right, and where no human " +
	"has looked at the artwork and answered the question. Artworks whose own accepted palettes " +
	"disagreed on the gradient boolean (conflicted ground truth) are excluded, matching the premise " +
	"analysis's primary population — there is nothing for a reviewer to disambiguate when the " +
	"published side does not agree with itself."

type PremiseRow = Readonly<{
	is_canary?: boolean
	status?: string
	parsed?: { ground_type: string } | null
	image_sha256: string
	prompt_variant: string
	gradient_truth: boolean
	gradient_truth_conflicted?: boolean
	schema_version?: string
}>

type EvalSetEntry = Readonly<{
	entryId: string
	included: boolean
	image: {
		imageId: string
		imagePath: string
		absolutePath: string
		sha256: string
		width: number
		height: number
		longEdgePx: number
		artworkId: string | null
	}
	groundTruth: { gradient: boolean; conflicted: boolean }
}>

/** Read the premise run and index it by image, keeping only usable answers. */
export async function readPremiseRun(path = PREMISE_RUN_PATH): Promise<
	Map<string, { truth: boolean; conflicted: boolean; byVariant: Map<string, string> }>
> {
	const text = await readFile(path, "utf8")
	const byImage = new Map<string, { truth: boolean; conflicted: boolean; byVariant: Map<string, string> }>()
	for (const line of text.split("\n")) {
		const trimmed = line.trim()
		if (trimmed.length === 0) continue
		const row = JSON.parse(trimmed) as PremiseRow
		// Canaries are a stability probe on a fixed image, not evaluation rows.
		if (row.is_canary === true || row.status !== "ok" || !row.parsed) continue
		let entry = byImage.get(row.image_sha256)
		if (entry === undefined) {
			entry = { truth: row.gradient_truth, conflicted: row.gradient_truth_conflicted === true, byVariant: new Map() }
			byImage.set(row.image_sha256, entry)
		}
		entry.byVariant.set(row.prompt_variant, row.parsed.ground_type)
	}
	return byImage
}

export async function readEvalSet(path = PREMISE_EVAL_SET_PATH): Promise<Map<string, EvalSetEntry>> {
	const parsed = JSON.parse(await readFile(path, "utf8")) as { entries: EvalSetEntry[] }
	return new Map(parsed.entries.map((entry) => [entry.image.sha256, entry]))
}

function shuffled<T>(values: readonly T[], random: () => number): T[] {
	const out = [...values]
	for (let index = out.length - 1; index > 0; index--) {
		const swap = Math.floor(random() * (index + 1))
		;[out[index], out[swap]] = [out[swap], out[index]]
	}
	return out
}

/**
 * Build the premise-test disambiguation round.
 *
 * Deliberately absent from the produced fixture: the oracle's answers, the published gradient
 * boolean, and each item's bucket. The analysis re-derives all of it from the source files by
 * content hash, so nothing that would tell the reviewer what to answer is ever written down beside
 * the items — not in the fixture, and therefore not anywhere the page could reach.
 */
export async function buildPremiseDisambiguationFixture(
	options: { runPath?: string; evalSetPath?: string; batchId?: string; seed?: number } = {},
): Promise<OracleValidationFixture> {
	const byImage = await readPremiseRun(options.runPath)
	const evalSet = await readEvalSet(options.evalSetPath)
	const seed = options.seed ?? PREMISE_DISAMBIGUATION_SEED

	const counts: Record<string, number> = {
		images_with_an_answer: byImage.size,
		conflicted_truth_excluded: 0,
		contradiction_hard_or_soft_under_A: 0,
		contradiction_hard_or_soft_under_B: 0,
		contradiction_under_both_variants: 0,
		selected: 0,
	}

	const selected: OracleValidationItem[] = []
	// Sorted by hash so the *selection* is order-independent; the serve order is shuffled separately.
	for (const sha256 of [...byImage.keys()].sort()) {
		const entry = byImage.get(sha256)!
		if (entry.conflicted) {
			counts.conflicted_truth_excluded += 1
			continue
		}
		const contradicting = [...entry.byVariant.entries()]
			.filter(([, groundType]) => p6Bucket(groundType, entry.truth).startsWith("contradiction"))
			.map(([variant]) => variant)
		if (contradicting.includes("A")) counts.contradiction_hard_or_soft_under_A += 1
		if (contradicting.includes("B")) counts.contradiction_hard_or_soft_under_B += 1
		if (contradicting.length > 1) counts.contradiction_under_both_variants += 1
		if (contradicting.length === 0) continue

		const image = evalSet.get(sha256)
		if (image === undefined) throw new Error(`no eval-set entry for ${sha256}; the two sources disagree about the corpus`)
		selected.push({
			// Content-derived and opaque: it names the artwork, and nothing about why it is here.
			itemId: `gt-${sha256.slice(0, 12)}`,
			questionKey: GROUND_TYPE_QUESTION.key,
			imagePath: image.image.imagePath,
			sha256,
			imageId: image.image.imageId,
			artworkId: image.image.artworkId,
			// Not every eval-set row is a sharded-corpus row: four come from the `images/` dev set.
			collection: deriveCollection(image.image.imagePath),
			rendition: {
				source: PREMISE_RENDITION_SOURCE,
				sourceEntryId: image.entryId,
				longEdgePx: image.image.longEdgePx,
				width: image.image.width,
				height: image.image.height,
			},
			stratum: tierOf(image.image.longEdgePx),
		})
	}
	counts.selected = selected.length

	const fixture: OracleValidationFixture = {
		fixtureVersion: PREMISE_DISAMBIGUATION_FIXTURE_VERSION,
		batchId: options.batchId ?? PREMISE_DISAMBIGUATION_BATCH_ID,
		purpose: "oracle-validation",
		labelSchemaVersion: ORACLE_LABEL_SCHEMA_VERSION,
		seed,
		generatedBy: "research/v3/src/review-server/oracle-validation.ts",
		builtFrom: [
			"research/v3/data/oracle-premise/premise-run-1.jsonl",
			"research/v3/data/oracle-premise/premise-run-1.agreement.json",
			PREMISE_RENDITION_SOURCE,
		],
		selection: { rule: PREMISE_SELECTION_RULE, counts },
		questions: [GROUND_TYPE_QUESTION],
		items: selected,
		serveOrder: shuffled(selected.map((item) => item.itemId), mulberry32(seed)),
	}
	validateFixture(fixture)
	return fixture
}

export function serializeFixture(fixture: OracleValidationFixture): string {
	return `${JSON.stringify(fixture, null, "\t")}\n`
}

/* ------------------------------------------------------------------------------------------- */
/* Batch 2 — the human probe round (PREMISE_NEXT.md §12)                                         */
/* ------------------------------------------------------------------------------------------- */

export const PROBE_GOLD_BATCH_ID = "oracle-probe-gold-1"
export const PROBE_GOLD_SEED = 20260803
/** The probe arm's question-set schema. The reviewer's rows must carry the model's, as always. */
export const PROBE_LABEL_SCHEMA_VERSION = "group-a.probes.v1.1"

export const PROBE_GOLD_FIXTURE_PATH = fileURLToPath(
	new URL("../../data/oracle-validation/probe-gold-1.json", import.meta.url),
)
const PROBE_PROMPT_DIR = fileURLToPath(new URL("../../oracle/premise/prompts/", import.meta.url))

/**
 * The six probes, in `bundled-p`'s order.
 *
 * Fixed and recorded rather than randomised per sitting: with one reviewer there is nothing to
 * average a randomised order over, and a fixed order is reproducible where a shuffled one is not
 * (PREMISE_NEXT.md §12). `enclosure` and `shading_direction` are not here — only these six derive
 * `ground_type`.
 * [REVIEWED] — `group-a.probes.v1.1.bundled-p.json`, questions 2–7.
 */
export const PROBE_ORDER = [
	"bg_visible",
	"one_colour",
	"continuous_change",
	"separate_areas",
	"motif_or_material",
	"depicted_place",
] as const

/** Probe key → its solo prompt file. Solo, because that file renders the probe on its own. */
const PROBE_PROMPT_FILES: Readonly<Record<string, string>> = {
	bg_visible: "group-a.probes.v1.1.solo-bg-visible.json",
	one_colour: "group-a.probes.v1.1.solo-one-colour.json",
	continuous_change: "group-a.probes.v1.1.solo-continuous-change.json",
	separate_areas: "group-a.probes.v1.1.solo-separate-areas.json",
	motif_or_material: "group-a.probes.v1.1.solo-motif-or-material.json",
	depicted_place: "group-a.probes.v1.1.solo-depicted-place.json",
}

/**
 * One key per probe answer. `y`/`n`/`u` keeps the one-keystroke, auto-advance property §6 asks for.
 *
 * The question `kind` is **`enum`, not `boolean`**: `BOOLEAN_HOTKEYS` is fixed at two keys and a
 * probe has three answers. A consequence worth stating, because the page has to handle it: `u` is an
 * *answer* here, so it is no longer undo — the page falls back to Backspace / ArrowLeft and says so
 * on screen.
 * [REVIEWED] — PREMISE_NEXT.md §12.
 */
const PROBE_HOTKEYS: Readonly<Record<string, string>> = { yes: "y", no: "n", unsure: "u" }

/**
 * The anti-coherence instruction, on every pass, verbatim from PREMISE_NEXT.md §12.
 *
 * The reviewer has seen these 30 artworks before and answered a six-way question about them. The
 * derivation is only meaningful if each probe is answered on its own terms rather than back-solved
 * into the answer they remember giving.
 */
export const PROBE_INSTRUCTION =
	"Answer this one question only. Do not try to make your answers across questions tell one story. " +
	"If you cannot tell, answer unsure — it is a real answer."

/**
 * Pull one probe's exact rendering out of its prompt file.
 *
 * Parsed, never transcribed. §12 requires the stem and every gloss to be byte-identical to what the
 * model was shown, and a hand-copied string is a byte-identical string right up until someone fixes
 * a typo in one of the two places.
 */
/** Small indirection so the parser can be pointed at a fixture directory in tests. */
function readFileSyncUtf8(path: string): string {
	return readFileSync(path, "utf8")
}

export function readProbePrompt(
	promptFile: string,
): { key: string; question: string; preamble: string; framing: string; answers: { key: string; gloss: string }[] } {
	const raw = JSON.parse(readFileSyncUtf8(promptFile)) as {
		referent_preamble: string
		unsure_framing: string
		canonical_fields: string[]
		prompt: string
	}
	const marker = "One question only.\n\n"
	const start = raw.prompt.indexOf(marker)
	if (start < 0) throw new Error(`${promptFile}: no single-probe block`)
	const block = raw.prompt.slice(start + marker.length).split("\n\nReply with JSON only.")[0]
	const [stem, ...optionLines] = block.split("\n")
	const key = stem.slice(0, stem.indexOf(" - "))
	if (raw.canonical_fields.length !== 1 || raw.canonical_fields[0] !== key) {
		throw new Error(`${promptFile}: stem names ${key} but the file declares ${raw.canonical_fields.join(", ")}`)
	}
	const answers = optionLines.map((line) => {
		const trimmed = line.trim()
		const at = trimmed.indexOf(" - ")
		if (at < 0) throw new Error(`${promptFile}: option line without a gloss: ${line}`)
		return { key: trimmed.slice(0, at), gloss: trimmed.slice(at + 3) }
	})
	return { key, question: stem, preamble: raw.referent_preamble, framing: raw.unsure_framing, answers }
}

/** Every probe as an `OracleQuestion`, in pass order. */
export function probeQuestions(promptDir = PROBE_PROMPT_DIR): OracleQuestion[] {
	return PROBE_ORDER.map((probe) => {
		const parsed = readProbePrompt(join(promptDir, PROBE_PROMPT_FILES[probe]))
		if (parsed.key !== probe) throw new Error(`${probe}: prompt file renders ${parsed.key}`)
		return {
			key: probe,
			kind: "enum",
			question: parsed.question,
			instruction: PROBE_INSTRUCTION,
			preamble: parsed.preamble,
			framing: parsed.framing,
			answers: parsed.answers.map((answer) => {
				const hotkey = PROBE_HOTKEYS[answer.key]
				if (hotkey === undefined) throw new Error(`${probe}: no hotkey for answer ${answer.key}`)
				return { key: answer.key, label: answer.key, gloss: answer.gloss, hotkey }
			}),
		}
	})
}

/**
 * The human probe round: the same 30 gold artworks, asked the six probes instead of the one six-way
 * question, in six contiguous passes.
 *
 * The item rows are **reused verbatim** from the disambiguation round's committed fixture — same
 * `imagePath`, same `sha256`, same rendition — so the join back to the reviewer's own direct answers
 * and to the model's rows is exact. Only the questions and the serve order change.
 */
export async function buildProbeGoldFixture(
	options: { goldFixturePath?: string; promptDir?: string; batchId?: string; seed?: number } = {},
): Promise<OracleValidationFixture> {
	const gold = JSON.parse(await readFile(options.goldFixturePath ?? PREMISE_DISAMBIGUATION_FIXTURE_PATH, "utf8")) as
		OracleValidationFixture
	const questions = probeQuestions(options.promptDir)
	const seed = options.seed ?? PROBE_GOLD_SEED
	const random = mulberry32(seed)

	const items: OracleValidationItem[] = []
	const serveOrder: string[] = []
	for (const question of questions) {
		const pass = gold.items.map((item) => ({
			...item,
			itemId: `pg-${question.key}-${item.sha256.slice(0, 12)}`,
			questionKey: question.key,
		}))
		items.push(...pass)
		// Contiguous passes, shuffled inside each one so the artworks are not walked in the same
		// order six times — which would let the reviewer recognise position rather than artwork.
		serveOrder.push(...shuffled(pass.map((item) => item.itemId), random))
	}

	const fixture: OracleValidationFixture = {
		fixtureVersion: PREMISE_DISAMBIGUATION_FIXTURE_VERSION,
		batchId: options.batchId ?? PROBE_GOLD_BATCH_ID,
		purpose: "oracle-validation",
		labelSchemaVersion: PROBE_LABEL_SCHEMA_VERSION,
		seed,
		generatedBy: "research/v3/src/review-server/oracle-validation.ts",
		builtFrom: [
			"research/v3/data/oracle-validation/premise-disambiguation-1.json",
			...PROBE_ORDER.map((probe) => `research/v3/oracle/premise/prompts/${PROBE_PROMPT_FILES[probe]}`),
		],
		selection: {
			rule:
				"The same 30 gold artworks as the disambiguation round, asked the six group-a.probes.v1.1 " +
				"probes that derive ground_type, one contiguous pass per probe in bundled-p's order. Two " +
				"pre-registered uses (PREMISE_NEXT.md §12): a probe-native gold with no construct-match " +
				"caveat, and the model-free reliability test — the reviewer's probe-derived tags against " +
				"the reviewer's own direct six-way answers on the same images.",
			counts: { artworks: gold.items.length, probes: questions.length, items: items.length },
		},
		questions,
		items,
		serveOrder,
	}
	validateFixture(fixture)
	return fixture
}

/* ------------------------------------------------------------------------------------------- */
/* Batch 3 — the group-BCDE reviewer validation round (PREMISE_NEXT.md §15.9)                     */
/* ------------------------------------------------------------------------------------------- */

export const BCDE_VALIDATION_BATCH_ID = "bcde-validation-1"

/**
 * The group-BCDE question set's own schema version, carried onto every reviewer row.
 * [INHERITED] — `group-bcde.v1.variant-e.json` `schema_version`; the pilot's rows carry the same.
 */
export const BCDE_LABEL_SCHEMA_VERSION = "group-bcde.v1"

/**
 * Seed for the selection draw and the per-pass serve shuffle.
 * [UNCALIBRATED] — the date §15.9 was written against, as the two earlier rounds use; any fixed
 * value works and this one is already on record in that section.
 */
export const BCDE_VALIDATION_SEED = 20260803

export const BCDE_VALIDATION_FIXTURE_PATH = fileURLToPath(
	new URL("../../data/oracle-validation/bcde-validation-1.json", import.meta.url),
)
export const COVERAGE_SET_PATH = fileURLToPath(new URL("../../data/coverage-set/coverage-set-1.json", import.meta.url))
export const BCDE_PILOT_RUN_PATH = fileURLToPath(new URL("../../data/oracle-premise/group-bcde-pilot-1.jsonl", import.meta.url))
export const BCDE_PROMPT_E_PATH = fileURLToPath(
	new URL("../../oracle/premise/prompts/group-bcde.v1.variant-e.json", import.meta.url),
)

/**
 * The eight questions this round asks, and why these eight.
 *
 * §15.9 priced two levers and named dropping questions the preferred one: "ask only what the pilot
 * showed to be worth validating … 8 questions × 20 artworks = 160 items, ~15 min. **Preferred**:
 * this is what the pilot is for." The pilot ran, and `bcde-pilot-1-analysis.json` is what picks
 * these. Each line names the verdict that put the question here.
 *
 * [REVIEWED] — `research/v3/data/oracle-premise/bcde-pilot-1-analysis.json`, verdicts as cited.
 */
export const BCDE_VALIDATION_QUESTION_REASONS: Readonly<Record<string, string>> = {
	has_signature_color:
		"the pilot's only spread FAILURE among the single-value questions (15.6-2b.has_signature_color: " +
		"yes on 85.9% of rows, over the 85% bar) and the weakest kappa in the set (0.4865, raw 0.8732 — " +
		"agreement carried almost entirely by the majority class). Self-consistency cannot tell a " +
		"well-calibrated yes from a reflex yes; a human can.",
	signature_carrier:
		"the accent question §15.8 names as the field's premise — can a model say which lane carries a " +
		"cover's colour. It passed inter-variant agreement (kappa 0.7091 on the gate-open subset) and " +
		"contradiction 6 never fired (n=0), so nothing in the pilot can distinguish 'right' from " +
		"'consistently wrong'. It is asked with has_signature_color because the two are one decision.",
	has_dominant_subject:
		"kappa 0.6618, the second-lowest of the single-value questions, on a question SAM depends on. " +
		"Its answer gates subject_kind and subject_area_band, so an error here propagates into two more.",
	subject_area_band:
		"kappa 0.607 on a rough-eyeball size judgement. §15.4 flags exactly this shape of question as " +
		"the one a cheaper computed statistic might reproduce — which cannot be checked without knowing " +
		"what the right answer was. Asked with has_dominant_subject because it is that question's child.",
	grain_or_noise:
		"kappa 0.5255, the second-weakest in the set, and 15.6-2.grain_confound is report_only: the " +
		"yes-rate on photographs runs 16 points above typography_only with no bar to read it against. " +
		"Grain is a perceptual judgement at a fixed rendition size, so the reviewer's answer is the only " +
		"thing that can say whether the model is seeing grain or inferring it from medium.",
	subject_kind:
		"§15.8 gives it 'the least standing … it should be the first deleted, not the last', and it is " +
		"the newest field. Its kappa is high (0.9312) and its distribution is 51% person, which is " +
		"consistent both with a correct instrument and with a model that answers 'person' by default. " +
		"Included at lower priority than the four above, per the pilot's ordering.",
	text_dominance:
		"included for coverage of group B rather than for a failing number: kappa 0.7284, no spread " +
		"failure. It is the one text question with a graded vocabulary, and asking it costs 20 items.",
	overlays:
		"included for coverage AND because it is the round's multi-select. 15.8.multi.overlays.singleton " +
		"is report_only at 0.9542 — the array returned one value on 95% of rows, which §15.8 says would " +
		"make the array machinery worthless. Whether that is the corpus or the instrument is a question " +
		"only a human answering the same list question can settle, and settling it needs kind:\"multi\".",
}

/**
 * The four questions the pilot showed do NOT need reviewer time, and why. Recorded on the fixture so
 * the omission is a decision on record rather than an oversight to be re-litigated.
 */
export const BCDE_VALIDATION_OMITTED_REASONS: Readonly<Record<string, string>> = {
	has_text:
		"kappa 0.9657 with raw agreement 0.993 — E and F differ on one image in 142. There is nothing " +
		"for 20 reviewer answers to resolve. (Its own FAILURE, 15.6-2a, is that illegible_at_this_size " +
		"never fires; that is a vocabulary question, not an accuracy question, and 20 more images at " +
		"this tier mix would not fire it either.)",
	physical_media_scan: "kappa 1.0, raw 1.0. Perfect inter-variant agreement on 142 images.",
	medium: "kappa 0.8146 and a well-spread distribution; the highest-agreement question with real spread.",
	text_roles:
		"exact-set agreement 0.7817, mean Jaccard 0.9123, no vocabulary value below the kappa floor. " +
		"§15.9 named it as the multi-select that would need kind:\"multi\" — the kind was built (it is " +
		"generic, and overlays uses it), but the pilot leaves text_roles nothing to validate.",
}

/**
 * Pass order: variant E's own question order, filtered to the eight.
 *
 * §15.9: "Pass order: variant E's question order. Fixed and recorded, not randomised — with one
 * reviewer there is nothing to average over." Derived from the prompt file rather than written out,
 * so a reordered prompt cannot silently disagree with the fixture.
 */
export function bcdeQuestionOrder(prompt: GroupBcdePrompt): string[] {
	return prompt.questionOrder.filter((key) => key in BCDE_VALIDATION_QUESTION_REASONS)
}

/**
 * The standing instruction, on every item of every pass. Verbatim from §15.9.
 *
 * The first sentence is the anti-coherence line the prompt files carry as the `answering` shared
 * block; the reviewer sees that block too, in the preamble, in the model's own words.
 */
export const BCDE_INSTRUCTION =
	"Answer this one question only. Do not try to make your answers across questions tell one story."

export type GroupBcdePromptQuestion = Readonly<{
	/** The canonical field name — `questionKey` on every record. */
	key: string
	/** The name the prompt uses on screen for it, e.g. `signature_colour` for `signature_carrier`. */
	displayKey: string
	/** The stem as the prompt renders it, minus only the "N. " enumerator. */
	stem: string
	answers: readonly Readonly<{ key: string; gloss: string }>[]
}>

export type GroupBcdePrompt = Readonly<{
	path: string
	schemaVersion: string
	variant: string
	/** All eight shared blocks, in the order the file declares them. */
	sharedBlocks: readonly string[]
	multiSelectFields: readonly string[]
	questionOrder: readonly string[]
	questions: ReadonlyMap<string, GroupBcdePromptQuestion>
}>

/** A numbered question stem: `3. texture_noise - is there visible grain …`. */
const BCDE_STEM = /^(\d+)\. ([a-z_0-9]+) - (.+)$/
/** An indented option line: `   yes - film grain, print dots, …`. */
const BCDE_OPTION = /^\s+([a-z_0-9]+) - (.+)$/

/**
 * Pull every question's exact rendering out of variant E's prompt file.
 *
 * Parsed, never transcribed — the probe-gold precedent (§12, applied again by §15.9): "Question text
 * and every `answers[].gloss` must be byte-identical to a prompt file's rendering of that question."
 * A hand-copied string is byte-identical right up until someone fixes a typo in one of the two
 * places, and an answer only means something against the exact words it was answered under.
 *
 * The only edit made to any string here is dropping the `N. ` enumerator from the stem: this round
 * asks eight questions, not thirteen, so the prompt's numbering names a position that does not
 * exist here. Everything after that enumerator, and every option line, is carried byte for byte.
 *
 * Three integrity checks, because a parser that quietly half-works is worse than none: the option
 * keys must equal the file's own declared vocabulary for that field, exactly and in order; every
 * canonical field must be reached; and every shared block must appear verbatim inside the prompt.
 */
export function readGroupBcdePrompt(promptFile = BCDE_PROMPT_E_PATH): GroupBcdePrompt {
	const raw = JSON.parse(readFileSyncUtf8(promptFile)) as {
		schema_version: string
		prompt_variant: string
		question_order: string[]
		shared_blocks: Record<string, string>
		canonical_fields: string[]
		vocabularies: Record<string, string[]>
		multi_select_fields: string[]
		field_map: Record<string, string>
		prompt: string
	}
	for (const [name, block] of Object.entries(raw.shared_blocks)) {
		if (!raw.prompt.includes(block)) throw new Error(`${promptFile}: shared block ${name} is not in the prompt verbatim`)
	}

	const questions = new Map<string, GroupBcdePromptQuestion>()
	let current: { key: string; displayKey: string; stem: string; answers: { key: string; gloss: string }[] } | null = null
	const flush = () => {
		if (current === null) return
		if (current.answers.length === 0) throw new Error(`${promptFile}: question ${current.displayKey} has no options`)
		const declared = raw.vocabularies[current.key]
		if (declared === undefined) throw new Error(`${promptFile}: no vocabulary declared for ${current.key}`)
		const parsed = current.answers.map((answer) => answer.key)
		if (parsed.join("|") !== declared.join("|")) {
			throw new Error(`${promptFile}: ${current.key} renders ${parsed.join(",")} but declares ${declared.join(",")}`)
		}
		questions.set(current.key, { ...current, answers: current.answers })
		current = null
	}
	for (const line of raw.prompt.split("\n")) {
		if (line.startsWith("Reply with JSON only.")) break
		const stem = BCDE_STEM.exec(line)
		if (stem !== null) {
			flush()
			const displayKey = stem[2]
			const key = raw.field_map[displayKey]
			if (key === undefined) throw new Error(`${promptFile}: no field_map entry for ${displayKey}`)
			current = { key, displayKey, stem: `${displayKey} - ${stem[3]}`, answers: [] }
			continue
		}
		if (current === null) continue
		const option = BCDE_OPTION.exec(line)
		if (option !== null) current.answers.push({ key: option[1], gloss: option[2] })
	}
	flush()

	const missing = raw.canonical_fields.filter((field) => !questions.has(field))
	if (missing.length > 0) throw new Error(`${promptFile}: the prompt renders no question for ${missing.join(", ")}`)
	return {
		path: promptFile,
		schemaVersion: raw.schema_version,
		variant: raw.prompt_variant,
		sharedBlocks: Object.values(raw.shared_blocks),
		multiSelectFields: raw.multi_select_fields,
		questionOrder: raw.question_order,
		questions,
	}
}

/**
 * The eight questions as the reviewer will be asked them.
 *
 * The preamble is **all eight shared blocks**, joined, above the question on every item of every
 * pass — §15.9: "not only inside `instruction`. They are the definitions the whole set rests on, and
 * two of them (`THE MAIN SUBJECT`, `ONE PICTURE, ONE MEDIUM`) are what make `subject_kind` and
 * `medium` answerable at all." They are carried unedited, including the LISTS block's "Two of the
 * thirteen questions", which is true of the prompt the model answered and not of this eight-question
 * round. Editing it would break the byte-identity that makes the two answers comparable; the
 * discrepancy is recorded on the fixture instead.
 */
export function bcdeQuestions(prompt: GroupBcdePrompt): OracleQuestion[] {
	const preamble = prompt.sharedBlocks.join("\n\n")
	return bcdeQuestionOrder(prompt).map((key) => {
		const parsed = prompt.questions.get(key)
		if (parsed === undefined) throw new Error(`${prompt.path}: no question ${key}`)
		const kind: OracleQuestionKind = prompt.multiSelectFields.includes(key) ? "multi" : "enum"
		return {
			key,
			kind,
			question: parsed.stem,
			instruction: BCDE_INSTRUCTION,
			preamble,
			answers: parsed.answers.map((answer, index) => {
				const hotkey = DIGIT_HOTKEYS[index]
				if (hotkey === undefined) throw new Error(`${key}: ${index + 1} answers is more than the digit row can bind`)
				return { key: answer.key, label: answer.key, gloss: answer.gloss, hotkey }
			}),
		}
	})
}

/* --- selecting the twenty artworks ---------------------------------------------------------- */

type CoverageArtwork = Readonly<{
	role: string
	collection: string
	artworkId: string
	path: string
	sha256: string
	width: number
	height: number
	longEdgePx: number
	tier: string
	cluster: number | null
	clusterRole: string | null
}>

/**
 * The coverage set's collection names, as the review server and the warehouse spell them.
 * [INHERITED] — `batch.ts` `deriveCollection`, which is what every other mode's records carry.
 */
const COVERAGE_COLLECTIONS: Readonly<Record<string, string>> = {
	sharded: "sharded-corpus",
	music_artworks: "music-artworks",
}

/**
 * The coverage set's own resolution tiers, used verbatim as the round's strata.
 *
 * Not `tierOf()`: that function is the premise test's tier rule for the eval-142 bench, and this
 * round is drawn from a different bench with its own published mix. COVERAGE_SET.md: "Report
 * anything measured on this set **stratified by `tier`**."
 * [INHERITED] — `research/v3/data/coverage-set/COVERAGE_SET.md`.
 */
export const COVERAGE_TIER_ORDER = ["<=400", "401-640", "641-1024", ">1024"] as const

/** How many artworks the round asks for. §15.9's own number, unchanged by the question lever. */
export const BCDE_VALIDATION_ARTWORKS = 20

export type BcdeSelection = Readonly<{
	artworks: readonly CoverageArtwork[]
	/** Per artwork: how well it joins to the pilot's rows, if at all. */
	pilotJoin: ReadonlyMap<string, "exact_bytes" | "same_artwork_other_rendition" | "none">
	counts: Readonly<Record<string, number>>
	tierQuotas: Readonly<Record<string, number>>
	byCluster: Readonly<Record<string, number>>
}>

export type PilotIndex = Readonly<{
	/** sha256 → the rendition the pilot actually decoded. */
	bySha: ReadonlySet<string>
	/** artworkId-shaped path stem → the pilot's `image_path`, for the artwork-level join. */
	byArtworkKey: ReadonlyMap<string, string>
	images: number
}>

/**
 * Index the pilot run by what an artwork can be joined on.
 *
 * Two grades, kept apart on purpose. **Exact bytes** is a real join: the reviewer and the model
 * looked at the same file. **Same artwork, other rendition** is not — a 300 px and a 640 px file are
 * different items under CONVENTIONS.md, and a grain question in particular can legitimately have
 * different answers on the two. The analysis reports the two grades separately and never pools them.
 */
export async function readBcdePilotRun(path = BCDE_PILOT_RUN_PATH): Promise<PilotIndex> {
	const text = await readFile(path, "utf8")
	const bySha = new Set<string>()
	const byArtworkKey = new Map<string, string>()
	const images = new Set<string>()
	for (const line of text.split("\n")) {
		const trimmed = line.trim()
		if (trimmed.length === 0) continue
		const row = JSON.parse(trimmed) as {
			is_canary?: boolean
			status?: string
			image_sha256: string
			image_path: string
			artwork_id?: string
		}
		if (row.is_canary === true) continue
		bySha.add(row.image_sha256)
		images.add(row.image_sha256)
		if (typeof row.artwork_id === "string") byArtworkKey.set(row.artwork_id, row.image_path)
	}
	return { bySha, byArtworkKey, images: images.size }
}

/**
 * Largest-remainder apportionment of `total` over the tiers, in proportion to the core's own mix.
 *
 * Ties on the remainder go to the larger tier — deterministic, seed-free, and it never lets a
 * rounding coin-flip decide which kind of cover is represented.
 */
export function tierQuotas(populations: Readonly<Record<string, number>>, total: number): Record<string, number> {
	const tiers = COVERAGE_TIER_ORDER.filter((tier) => (populations[tier] ?? 0) > 0)
	const universe = tiers.reduce((sum, tier) => sum + populations[tier], 0)
	const exact = tiers.map((tier) => ({ tier, want: (populations[tier] / universe) * total }))
	const quotas: Record<string, number> = {}
	for (const entry of exact) quotas[entry.tier] = Math.floor(entry.want)
	let left = total - Object.values(quotas).reduce((sum, value) => sum + value, 0)
	const ranked = [...exact].sort((a, b) => {
		const remainder = b.want - Math.floor(b.want) - (a.want - Math.floor(a.want))
		if (Math.abs(remainder) > 1e-9) return remainder
		return populations[b.tier] - populations[a.tier]
	})
	for (const entry of ranked) {
		if (left <= 0) break
		quotas[entry.tier] += 1
		left -= 1
	}
	return quotas
}

export const BCDE_SELECTION_RULE =
	"Twenty artworks from the coverage set's CORE (research/v3/data/coverage-set/coverage-set-1.json, " +
	"role === 'core'), which is the canonical tuning bench; NOT from eval-142, which COVERAGE_SET.md " +
	"establishes was never a sample of this corpus. Two steps, neither of which looks at any model " +
	"answer. (1) PINNED: every core artwork the group-BCDE pilot actually decoded — there are three, " +
	"and they are the only artworks in the whole core where a reviewer-vs-E/F comparison is possible " +
	"at all, so all three are taken. (2) DRAWN: the remaining slots, apportioned across the core's own " +
	"resolution tiers in proportion to the core's tier mix (largest remainder, ties to the larger " +
	"tier), and inside each tier taken by a seeded round-robin over clusters — every cluster is " +
	"visited at most once before any is revisited, so twenty artworks land in twenty different " +
	"clusters wherever the tier quotas allow. Seed 20260803. Deliberately NOT re-selected on E-vs-F " +
	"disagreement (§3's rule, restated by §15.9): a round conditioned on disagreement is a different " +
	"population and must be reported as one."

export function selectBcdeArtworks(
	core: readonly CoverageArtwork[],
	pilot: PilotIndex,
	seed: number,
	total = BCDE_VALIDATION_ARTWORKS,
): BcdeSelection {
	const random = mulberry32(seed)
	const pilotJoin = new Map<string, "exact_bytes" | "same_artwork_other_rendition" | "none">()
	for (const artwork of core) {
		pilotJoin.set(
			artwork.artworkId,
			pilot.bySha.has(artwork.sha256)
				? "exact_bytes"
				: pilot.byArtworkKey.has(artwork.artworkId)
					? "same_artwork_other_rendition"
					: "none",
		)
	}

	// Sorted by content hash, so the candidate pool is order-independent before the seeded stream
	// touches it: the file's own row order must not be able to change the draw.
	const pool = [...core].sort((a, b) => (a.sha256 < b.sha256 ? -1 : 1))
	const pinned = pool.filter((artwork) => pilotJoin.get(artwork.artworkId) !== "none")
	const taken = new Set(pinned.map((artwork) => artwork.artworkId))

	const populations: Record<string, number> = {}
	for (const artwork of pool) populations[artwork.tier] = (populations[artwork.tier] ?? 0) + 1
	const quotas = tierQuotas(populations, total)

	// The pinned artworks spend their own tier's quota. They are not extra.
	const remaining: Record<string, number> = { ...quotas }
	for (const artwork of pinned) remaining[artwork.tier] = (remaining[artwork.tier] ?? 0) - 1

	const selected = [...pinned]
	const clusterUse = new Map<string, number>()
	for (const artwork of pinned) {
		const key = String(artwork.cluster)
		clusterUse.set(key, (clusterUse.get(key) ?? 0) + 1)
	}
	for (const tier of COVERAGE_TIER_ORDER) {
		let want = remaining[tier] ?? 0
		if (want <= 0) continue
		const candidates = shuffled(
			pool.filter((artwork) => artwork.tier === tier && !taken.has(artwork.artworkId)),
			random,
		)
		// Round-robin over clusters: on each sweep, only artworks from the least-used clusters are
		// eligible. Coverage that piles several picks into one cluster is not coverage (COVERAGE_SET.md
		// step 5), and with 20 picks over 36 clusters there is no reason to double up at all.
		while (want > 0) {
			const floor = Math.min(
				...candidates.filter((artwork) => !taken.has(artwork.artworkId)).map((artwork) => clusterUse.get(String(artwork.cluster)) ?? 0),
			)
			if (!Number.isFinite(floor)) break
			for (const artwork of candidates) {
				if (want <= 0) break
				if (taken.has(artwork.artworkId)) continue
				if ((clusterUse.get(String(artwork.cluster)) ?? 0) !== floor) continue
				taken.add(artwork.artworkId)
				clusterUse.set(String(artwork.cluster), floor + 1)
				selected.push(artwork)
				want -= 1
			}
		}
	}

	const byCluster: Record<string, number> = {}
	for (const artwork of selected) byCluster[String(artwork.cluster)] = (byCluster[String(artwork.cluster)] ?? 0) + 1
	const counts: Record<string, number> = {
		core_artworks: core.length,
		pilot_images: pilot.images,
		core_in_pilot_exact_bytes: pool.filter((artwork) => pilotJoin.get(artwork.artworkId) === "exact_bytes").length,
		core_in_pilot_same_artwork_other_rendition: pool.filter(
			(artwork) => pilotJoin.get(artwork.artworkId) === "same_artwork_other_rendition",
		).length,
		pinned: pinned.length,
		drawn: selected.length - pinned.length,
		selected: selected.length,
		distinct_clusters: Object.keys(byCluster).length,
	}
	for (const tier of COVERAGE_TIER_ORDER) {
		counts[`tier_${tier}`] = selected.filter((artwork) => artwork.tier === tier).length
	}
	return { artworks: selected, pilotJoin, counts, tierQuotas: quotas, byCluster }
}

/**
 * Build the group-BCDE reviewer validation round.
 *
 * Deliberately absent from the produced fixture, as in both earlier rounds: every model answer, and
 * anything a reader could invert into one. No E or F answer, no SAM mask, no per-item join grade
 * that would hint at whether the model has seen this cover. The analysis re-derives all of it from
 * the pilot's JSONL by content hash, so nothing that could steer an answer is ever written down
 * beside the items — not in the fixture, and therefore not anywhere the page could reach.
 */
export async function buildBcdeValidationFixture(
	options: { coverageSetPath?: string; pilotRunPath?: string; promptPath?: string; batchId?: string; seed?: number } = {},
): Promise<OracleValidationFixture> {
	const seed = options.seed ?? BCDE_VALIDATION_SEED
	const coverage = JSON.parse(await readFile(options.coverageSetPath ?? COVERAGE_SET_PATH, "utf8")) as {
		artworks: CoverageArtwork[]
	}
	const core = coverage.artworks.filter((artwork) => artwork.role === "core")
	const pilot = await readBcdePilotRun(options.pilotRunPath)
	const prompt = readGroupBcdePrompt(options.promptPath)
	if (prompt.schemaVersion !== BCDE_LABEL_SCHEMA_VERSION) {
		throw new Error(`${prompt.path} is schema ${prompt.schemaVersion}, this round is built for ${BCDE_LABEL_SCHEMA_VERSION}`)
	}
	const questions = bcdeQuestions(prompt)
	if (questions.length !== Object.keys(BCDE_VALIDATION_QUESTION_REASONS).length) {
		throw new Error(`${questions.length} questions rendered, ${Object.keys(BCDE_VALIDATION_QUESTION_REASONS).length} scoped`)
	}
	const selection = selectBcdeArtworks(core, pilot, seed, BCDE_VALIDATION_ARTWORKS)

	const random = mulberry32(seed)
	const items: OracleValidationItem[] = []
	const serveOrder: string[] = []
	for (const question of questions) {
		const pass = selection.artworks.map((artwork) => ({
			itemId: `bv-${question.key}-${artwork.sha256.slice(0, 12)}`,
			questionKey: question.key,
			imagePath: artwork.path,
			sha256: artwork.sha256,
			imageId: artwork.path.slice(artwork.path.lastIndexOf("/") + 1),
			artworkId: artwork.artworkId,
			collection: COVERAGE_COLLECTIONS[artwork.collection] ?? artwork.collection,
			rendition: {
				source: "research/v3/data/coverage-set/coverage-set-1.json",
				sourceEntryId: artwork.artworkId,
				longEdgePx: artwork.longEdgePx,
				width: artwork.width,
				height: artwork.height,
			},
			// The coverage set's own tier, not tierOf(): a different bench, a different published mix.
			stratum: artwork.tier,
		}))
		items.push(...pass)
		// Contiguous passes, shuffled inside each one so the artworks are not walked in the same order
		// eight times — which would let the reviewer recognise position rather than artwork.
		serveOrder.push(...shuffled(pass.map((item) => item.itemId), random))
	}

	const fixture: OracleValidationFixture = {
		fixtureVersion: PREMISE_DISAMBIGUATION_FIXTURE_VERSION,
		batchId: options.batchId ?? BCDE_VALIDATION_BATCH_ID,
		purpose: "oracle-validation",
		labelSchemaVersion: BCDE_LABEL_SCHEMA_VERSION,
		seed,
		generatedBy: "research/v3/src/review-server/oracle-validation.ts",
		builtFrom: [
			"research/v3/data/coverage-set/coverage-set-1.json",
			"research/v3/oracle/premise/prompts/group-bcde.v1.variant-e.json",
			"research/v3/data/oracle-premise/group-bcde-pilot-1.jsonl",
			"research/v3/data/oracle-premise/bcde-pilot-1-analysis.json",
		],
		selection: {
			rule:
				`${BCDE_SELECTION_RULE} WORDING: every stem and every gloss is parsed byte-identically out ` +
				`of variant ${prompt.variant}'s prompt file (the "N. " enumerator is the only thing dropped, ` +
				"because this round has eight passes and not thirteen). §15.9: E and F word the same " +
				"questions differently, so scoring F against these answers carries a stated wording caveat " +
				"that scoring E does not. THE JOIN: only " +
				`${selection.counts.core_in_pilot_exact_bytes} of the ${selection.counts.core_artworks} core ` +
				"artworks were decoded by the pilot on the same bytes, and " +
				`${selection.counts.core_in_pilot_same_artwork_other_rendition} more at another rendition — ` +
				"so on the other artworks in this round there is no model answer to compare against yet, " +
				"and the round's product there is a reviewer label on the coverage set and an answer to " +
				"'is this question answerable by a human at all'.",
			counts: { ...selection.counts, questions: questions.length, items: items.length },
		},
		questions,
		items,
		serveOrder,
	}
	validateFixture(fixture)
	return fixture
}

/** Absolute path of one item's rendition. The fixture stores repo-root-relative paths. */
export function itemImagePath(item: OracleValidationItem, repoRoot = REPO_ROOT): string {
	return join(repoRoot, item.imagePath)
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: { write: { type: "boolean", default: false }, fixture: { type: "string", default: "disambiguation" } },
		strict: true,
	})
	if (values.fixture === "bcde") {
		const bcde = await buildBcdeValidationFixture()
		const counts = bcde.selection.counts
		process.stdout.write(
			`${bcde.batchId}: ${bcde.items.length} items = ${counts.selected} artworks x ${counts.questions} questions\n`,
		)
		process.stdout.write(
			`  core∩pilot: ${counts.core_in_pilot_exact_bytes} on the same bytes, ` +
				`${counts.core_in_pilot_same_artwork_other_rendition} same artwork/other rendition — all ${counts.pinned} pinned\n`,
		)
		process.stdout.write(`  clusters: ${counts.distinct_clusters} distinct of 36\n`)
		for (const tier of COVERAGE_TIER_ORDER) {
			process.stdout.write(`  ${tier.padEnd(10)} ${counts[`tier_${tier}`]}\n`)
		}
		for (const question of bcde.questions) {
			process.stdout.write(
				`  ${question.key.padEnd(20)} ${question.kind.padEnd(6)} ` +
					`${question.answers.map((answer) => `${answer.hotkey}=${answer.key}`).join(" ")}\n`,
			)
		}
		if (values.write) {
			await writeFile(BCDE_VALIDATION_FIXTURE_PATH, serializeFixture(bcde))
			process.stdout.write(`wrote ${BCDE_VALIDATION_FIXTURE_PATH}\n`)
		}
		return
	}
	if (values.fixture === "probe-gold") {
		const probes = await buildProbeGoldFixture()
		process.stdout.write(
			`${probes.batchId}: ${probes.items.length} items = ` +
				`${probes.selection.counts.artworks} artworks x ${probes.selection.counts.probes} probes\n`,
		)
		for (const question of probes.questions) {
			process.stdout.write(
				`  ${question.key.padEnd(18)} ${question.answers.map((answer) => `${answer.hotkey}=${answer.key}`).join(" ")}\n`,
			)
		}
		if (values.write) {
			await writeFile(PROBE_GOLD_FIXTURE_PATH, serializeFixture(probes))
			process.stdout.write(`wrote ${PROBE_GOLD_FIXTURE_PATH}\n`)
		}
		return
	}
	const fixture = await buildPremiseDisambiguationFixture()
	const counts = fixture.selection.counts
	process.stdout.write(`${fixture.batchId}: ${fixture.items.length} items, ${fixture.questions.length} question\n`)
	process.stdout.write(
		`  contradictions: ${counts.contradiction_hard_or_soft_under_A} under A, ` +
			`${counts.contradiction_hard_or_soft_under_B} under B, ` +
			`${counts.contradiction_under_both_variants} under both → ${counts.selected} distinct artworks\n`,
	)
	const byTier = new Map<string, number>()
	for (const item of fixture.items) byTier.set(item.stratum, (byTier.get(item.stratum) ?? 0) + 1)
	for (const [tier, count] of [...byTier].sort()) process.stdout.write(`  ${tier.padEnd(18)} ${count}\n`)
	if (values.write) {
		await writeFile(PREMISE_DISAMBIGUATION_FIXTURE_PATH, serializeFixture(fixture))
		process.stdout.write(`wrote ${PREMISE_DISAMBIGUATION_FIXTURE_PATH}\n`)
	}
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
	await main()
}
