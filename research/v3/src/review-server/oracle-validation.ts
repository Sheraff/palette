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

export type OracleQuestion = Readonly<{
	/** `questionKey` on every record this question produces, e.g. `ground_type`. */
	key: string
	kind: "enum" | "boolean"
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
		if (question.kind === "enum" && question.answers.length > MAX_ENUM_ANSWERS) {
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

/** Absolute path of one item's rendition. The fixture stores repo-root-relative paths. */
export function itemImagePath(item: OracleValidationItem, repoRoot = REPO_ROOT): string {
	return join(repoRoot, item.imagePath)
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: { write: { type: "boolean", default: false }, fixture: { type: "string", default: "disambiguation" } },
		strict: true,
	})
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
