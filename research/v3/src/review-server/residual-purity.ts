/**
 * The residual-purity rounds — the reviewer's answer to the one question the residual numbers cannot
 * answer themselves: **is what remains after the subject masks are subtracted actually background?**
 *
 * Two rounds live here, and they are the same instrument twice.
 *
 *  - **`residual-purity-1`**, pre-registered in `oracle/sam/RESIDUAL_EXPERIMENT_NOTES.md` §11.11
 *    (which supersedes §8), built from `data/sam/residual-sheets-v4-sample.json`. It ran, and
 *    `RESIDUAL_PURITY_VERDICT.md` returned NOT-ADOPT at a reweighted pure-field rate of 0.2424.
 *  - **`residual-purity-2`**, pre-registered in `oracle/sam/RESIDUAL_V5_NOTES.md` §12.9, built from
 *    `data/sam/residual-sheets-v5-sample.json`. §12.9 is a *successor* to §11.11 and not a
 *    replacement of it: §11.11 was consumed by the round it specified.
 *
 * §12.9 lives in `RESIDUAL_V5_NOTES.md` rather than in `RESIDUAL_EXPERIMENT_NOTES.md` for a reason
 * this file has to honour when it cites its own pre-registration: the notes file was carrying another
 * agent's parked staged edit and could not be appended to. So round 2 names `RESIDUAL_V5_NOTES.md` in
 * `builtFrom` and in `fundedBy`. When the parked set lands and §12 is folded in, those two strings
 * move; nothing else does.
 *
 * ## What changed between the two rounds, and what deliberately did not
 *
 * **Changed — the fourth answer.** Round 1 offered `pure field / mostly field / not field` and its
 * framing sent an undecidable panel to `mostly field`. The reviewer's finding afterwards was that
 * this is not always a hedge but sometimes a real property of the cover: *"sometimes it's hard to
 * tell what is field and what is subject, so answers for those cases are not reliable (even with
 * human feedback) unless we add an escape answer choice."* Round 2 adds **`cant_tell`** — "can't tell
 * what is field here" — as proposed decision record `d-2026-08-04-purity-rounds-need-escape-answer`,
 * under design rule 8: a slot must be able to record the answer. §12.9 fixes its scoring **in
 * advance**: it is not pure, not not-pure, and not dropped — it leaves both the numerator and the
 * denominator, and its share is reported per stratum as a first-class ambiguity measurement.
 *
 * **Not changed — everything else.** Same three panels, same subtraction cut, same guard variants,
 * same two passes, same stem, same preamble, same instruction, same strata, same quotas, and the
 * **same bar**: reweighted pure-field ≥ 0.75 in at least one guard variant, no stratum below 0.50.
 * v5's *proxy* improved (0.8239 → 0.8592); round 1 is precisely the evidence that a proxy improvement
 * says nothing about purity — it over-claimed by a measured 0.582 — so the bar does not move on it.
 * Moving a pre-registered bar because a different measurement improved is the exact failure
 * pre-registration exists to prevent.
 *
 * **Consequence for comparability, stated rather than assumed:** round 2 carries its own label schema
 * `residual-purity.v2`. A fourth answer drains answers from all three of the others, so a v1
 * `mostly_field` and a v2 `mostly_field` are not the same measurement and must not be pooled by a
 * consumer that joins on the schema. The strata, the sheets' provenance and the bar are unchanged, so
 * the *round-level* comparison §12.9 wants is still available — it is just not an answer-level one.
 *
 * **A leaf file, like `sam-mask-quality.ts` beside it.** It builds an `OracleValidationFixture` and
 * imports; nothing in `oracle-validation.ts`, `server.ts` or the page is modified, and the round
 * needs no new serve mode: it is an ordinary `by-question` round with two passes.
 *
 * ## Why two questions per sheet, and not one
 *
 * Each sheet is three panels — **artwork | what remains, area guard ON | what remains, area guard
 * OFF** — and the spec asks its question **once per panel**. The bar is stated per guard variant
 * ("≥ 0.75 in at least one guard variant"), and its second, ungated clause compares the two variants
 * against each other for A6's `person` exemption. A single answer per sheet could fund neither. So a
 * round asks the same question twice, once naming each residual panel, and an item is one **(sheet,
 * panel)** pair — `labelUnit` in REVIEW_UI.md §6's sense is (image, question), not image. Round 1:
 * 25 sheets, 50 items. Round 2: 24 sheets, 48 items, in two contiguous passes either way.
 *
 * The cost is stated rather than hidden, the same way the mask-quality round states its own: the
 * second pass shows the reviewer sheets they have already seen, so a pass-2 answer can be anchored on
 * the pass-1 answer for the same sheet. Two things hold it down — the two passes are shuffled
 * independently, so the sheets do not arrive in the same order twice, and the panel being judged is
 * named in the stem and labelled on the sheet. The analysis reports the pair, per sheet; it does not
 * average the anchoring away.
 *
 * ## What is kept away from the reviewer
 *
 * Every number this round exists to be a second opinion about: `residual_guard_on`,
 * `residual_guard_off`, `residual_static_guard_off`, the contamination causes, the noun that was
 * prompted and its disposition, the fired concepts. All of it stays in the manifest, which the
 * analysis re-joins by `item_id` after release — the same discipline as the mask-quality round.
 * `assertNoAnswerKey` checks it structurally rather than trusting this comment.
 *
 * Regenerate a committed fixture (its sheets must exist first — `oracle/sam/build_residual_sheets_v4.py`
 * for round 1, `build_residual_sheets_v5.py` for round 2):
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *     research/v3/src/review-server/residual-purity.ts --round 2 --write
 */
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import sharp from "sharp"
import { mulberry32 } from "../contract/calibration/same-color-bar-translation.ts"
import {
	PREMISE_DISAMBIGUATION_FIXTURE_VERSION,
	serializeFixture,
	validateFixture,
	type OracleAnswerOption,
	type OracleQuestion,
	type OracleValidationFixture,
	type OracleValidationItem,
} from "./oracle-validation.ts"
import { stratifiedShuffle } from "./sam-mask-quality.ts"

/* ------------------------------------------------------------------------------------------- */
/* Identity                                                                                      */
/* ------------------------------------------------------------------------------------------- */

export const RESIDUAL_PURITY_BATCH_ID = "residual-purity-1"

/**
 * The label schema these answers are comparable under.
 *
 * Human-only, like `sam-mask-quality.v1` and for the same reason: there is no model arm to be
 * row-comparable with. SAM emits masks; the residual is a subtraction; neither answers "is what is
 * left background". The schema names the human instrument, and the analysis joins on it.
 */
export const RESIDUAL_PURITY_LABEL_SCHEMA_VERSION = "residual-purity.v1"

/**
 * Seed for the serve-order shuffle.
 *
 * **20260804, the sample's own seed**, taken from §11.11 rather than invented here. §11.11 chose it
 * deliberately over §8's 20260803 so that an overlap between the v3 and v4 samples could never be
 * mistaken for a paired design; reusing it for the serve order keeps the whole round reproducible
 * from one number.
 */
export const RESIDUAL_PURITY_SEED = 20260804

export const RESIDUAL_PURITY_SAMPLE_PATH = fileURLToPath(
	new URL("../../data/sam/residual-sheets-v4-sample.json", import.meta.url),
)
export const RESIDUAL_PURITY_FIXTURE_PATH = fileURLToPath(
	new URL("../../data/sam/residual-purity-1.json", import.meta.url),
)

export const RESIDUAL_PURITY_2_BATCH_ID = "residual-purity-2"

/**
 * Round 2's label schema — **`.v2`, not `.v1`**, and the version bump is the whole point.
 *
 * A label schema is the vocabulary answers are comparable under. Round 2 offers a fourth answer, and
 * `cant_tell` does not draw only from the panels round 1 would have called ambiguous: it drains from
 * `pure_field`, `mostly_field` and `not_field` alike, in proportions nobody knows. Serving both
 * rounds under one schema would let a consumer concatenate 50 v4 answers and 48 v5 answers into one
 * rate, and that rate would be a mixture of two instruments reported as one.
 */
export const RESIDUAL_PURITY_2_LABEL_SCHEMA_VERSION = "residual-purity.v2"

/**
 * Seed for round 2, **20260805**, taken from §12.9 rather than invented here.
 *
 * §12.9 chose it deliberately over §11.11's 20260804 and §8's 20260803 for the same reason those two
 * differ from each other: if two rounds shared a seed, an overlapping sample would look like a
 * deliberate paired design when it was an accident of the RNG.
 */
export const RESIDUAL_PURITY_2_SEED = 20260805

export const RESIDUAL_PURITY_2_SAMPLE_PATH = fileURLToPath(
	new URL("../../data/sam/residual-sheets-v5-sample.json", import.meta.url),
)
export const RESIDUAL_PURITY_2_FIXTURE_PATH = fileURLToPath(
	new URL("../../data/sam/residual-purity-2.json", import.meta.url),
)

/** research/v3/src/review-server/ → repository root. Fixture paths are stored relative to it. */
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url))

/**
 * What the served file is. Not a corpus name and not the mask-quality overlay collection: the bytes
 * are a three-panel residual sheet, a different rendition of a different thing, and two rounds whose
 * items claimed the same collection would join to each other in the warehouse.
 */
export const SHEET_COLLECTION = "sam-residual-sheet"

/* ------------------------------------------------------------------------------------------- */
/* The question                                                                                  */
/* ------------------------------------------------------------------------------------------- */

/**
 * The two panels that are judged, in the order their passes run.
 *
 * `label` is the string the sheet builder draws under the panel, byte-identical
 * (`oracle/sam/build_residual_sheets_v4.py`). The stem quotes it so the reviewer can find the panel
 * being asked about by reading, not by counting from the left — and so that a change to the sheet's
 * labels breaks the round loudly here instead of quietly on screen.
 *
 * Guard ON runs first. That order is **arbitrary and fixed**, not a claim that one variant is the
 * default: §11.11's guard comparison is between-variant on the same sheets, so whichever pass runs
 * second carries the anchoring, and saying which one it is beats leaving it to the RNG.
 */
export const RESIDUAL_PANELS = [
	{ key: "guard_on", label: "what remains - area guard ON", position: "middle" },
	{ key: "guard_off", label: "what remains - area guard OFF", position: "right" },
] as const

/**
 * Round 1's three answers, one keystroke each (REVIEW_UI.md §6).
 *
 * `kind` is **`enum`, not `boolean`** — three answers, and `BOOLEAN_HOTKEYS` is fixed at `y`/`n`.
 * The hotkeys are the initials of the answers themselves (`p`/`m`/`n`) and none of them is `u`, so
 * undo stays on `u` and the footer does not have to displace it to Backspace.
 *
 * `mostly field` is a real answer and not a hedge. §11.11's bar is written on the **pure** rate
 * alone, so a sheet with one surviving letterform and a sheet with half a face still in it must not
 * collapse into the same "not pure" bucket — the adoption question and the diagnosis of *what leaks*
 * are different questions and the round is cheap enough to answer both.
 *
 * The keys are the vocabulary §11.11 pre-registers, verbatim: pure field / mostly field / not field.
 */
export const RESIDUAL_PURITY_ANSWERS: readonly OracleAnswerOption[] = [
	{
		key: "pure_field",
		label: "pure field",
		gloss: "everything still visible is background: nothing left that belongs to a depicted subject, to display text, or to an applied mark",
		hotkey: "p",
	},
	{
		key: "mostly_field",
		label: "mostly field",
		gloss: "background apart from a trace — an edge, a fragment of a letter, part of a mark — that you would not call a subject",
		hotkey: "m",
	},
	{
		key: "not_field",
		label: "not field",
		gloss: "something that belongs to a depicted subject, to display text, or to an applied mark is plainly still here",
		hotkey: "n",
	},
]

/**
 * Round 2's answers — round 1's three, unchanged to the byte, plus the escape.
 *
 * **The first three are copied by reference and not retyped.** The round exists to test the same bar
 * under a corrected elicitation; if `pure_field`'s gloss drifted by a word while the bar stayed put,
 * the comparison to round 1's 0.2424 would be between two questions rather than two runs.
 *
 * **`c`, and the choice is constrained rather than free.** `u` must stay undo, or `oracle.js` displaces
 * it to Backspace mid-round (`undoIsTaken()`); `r` must stay release, or the answer silently shadows it,
 * because the page checks the answer map first. `p`, `m` and `n` are taken. `c` is the initial of the
 * answer, like the other three, and it is the only key that is both free and mnemonic.
 *
 * **What the escape is, and what it is not.** It is not "I did not look hard enough" and it is not a
 * fourth point on the purity scale — it sits off the scale entirely. It is the answer for a cover that
 * does not separate into a subject and a field at all, so that no panel of it can be graded for whether
 * what is left is background. §12.9 fixes its scoring before any answer is seen: excluded from both the
 * numerator and the denominator of the pure-field rate, never dropped, and its **share reported per
 * stratum as a first-class result** — figure/ground ambiguity is a property of the covers, not noise. A
 * stratum whose escape share exceeds 0.50 has no reliable purity rate and must be reported as having
 * none, rather than as having a low one.
 *
 * `GROUND_FREETEXT_SYNTHESIS.md` found 3 of 9 covers ambiguous in unconstrained prose, before anyone
 * proposed this answer, which is the independent evidence that the slot has referents to catch.
 */
export const RESIDUAL_PURITY_2_ANSWERS: readonly OracleAnswerOption[] = [
	...RESIDUAL_PURITY_ANSWERS,
	{
		key: "cant_tell",
		label: "can't tell what is field here",
		gloss: "this cover does not separate into a subject and a background you could point to, so there is no fact about whether what is left is background",
		hotkey: "c",
	},
]

/**
 * The referent preamble, above the question on every item of both passes.
 *
 * Two things it has to fix, and both would otherwise be answered differently by different sheets.
 * **The checkerboard is not content**: a reviewer who reads the grey squares as a defect is grading
 * the rendering, and every panel would fail. **The left panel is the control**: what counts as a
 * subject on this cover is only knowable from the artwork beside it.
 */
export const RESIDUAL_PURITY_PREAMBLE =
	"Left: the artwork, untouched. The other two panels are what remains of it after the detected subjects were " +
	"subtracted, under two settings of one internal rule. The grey checkerboard is where pixels were removed — " +
	"it is not part of the picture and never counts against a panel."

/**
 * The standing instruction, on screen for every item of every pass.
 *
 * The anti-coherence line (PREMISE_NEXT.md §12) is load-bearing here in a way it is not everywhere:
 * the two passes ask the same question of two panels of the *same sheet*, and a reviewer trying to
 * keep their answers consistent across the pair would manufacture exactly the between-variant
 * difference §11.11's second clause is trying to measure.
 *
 * The recall clause is the residual's version of the mask-quality round's: this question is about
 * what is **left**, never about what was taken. An over-subtracted panel — half the background gone
 * with the subject — is a real defect and a different round; here it is still `pure field`, and a
 * reviewer who marks it down is answering a question nobody asked.
 */
export const RESIDUAL_PURITY_INSTRUCTION =
	"Judge only the panel named in the question, and only what is still visible in it. Whether too much was " +
	"removed is not this question. Answer this one panel; do not try to make your answers across panels or " +
	"across sheets tell one story."

/**
 * The unsure framing.
 *
 * There is no `unsure` key — the middle answer is a graded answer, not an escape — so the framing has
 * to say where a genuinely undecidable panel goes. It goes to `mostly field`, **never** to
 * `pure field`: the pre-registered bar is a floor on the pure rate, and a rule that swept
 * "I cannot tell" into the numerator would raise the very quantity the bar is testing.
 */
export const RESIDUAL_PURITY_FRAMING =
	"If you cannot tell whether something left in the panel is a subject or part of the background, even after " +
	"zooming, answer mostly field. Keep pure field for panels where you are sure nothing is left."

/**
 * Round 2's framing, and it is the one piece of wording that HAD to change.
 *
 * Round 1's framing above is the sentence the escape answer exists to retire: it swept every
 * undecidable panel into `mostly field`, which is why the round could not distinguish "a trace of
 * something is left" from "this picture has no field". Leaving it in place beside a `cant_tell` key
 * would be worse than either — the reviewer would be told to route ambiguity to a slot that is no
 * longer where ambiguity goes.
 *
 * It draws the line where §12.9 draws it, and the direction matters both ways. **Down:** an
 * ambiguous panel still must not reach `pure field`, because the bar is a floor on the pure rate and
 * a rule that swept "I cannot tell" into the numerator would raise the very quantity being tested —
 * so the escape absorbs it instead, and the escape is outside the rate. **Up:** `cant_tell` is not a
 * general-purpose "not sure" either. A cover whose field you can see, where the only doubt is
 * whether one leftover trace belongs to it, is still a `mostly field` — that is what `mostly field`
 * is for, and letting the escape eat those answers would inflate an ambiguity share that §12.9
 * publishes as a measurement of the covers.
 */
export const RESIDUAL_PURITY_2_FRAMING =
	"If this cover does not separate into a subject and a background at all — if you could not say what the " +
	"field is even looking at the artwork on the left — answer can't tell. That is a real answer about the cover " +
	"and it is counted as one, not as a skip. Keep it for that case only: if you can see what the field is and " +
	"are merely unsure whether one leftover trace belongs to it, answer mostly field. Keep pure field for panels " +
	"where you are sure nothing is left."

/** `residual_is_field.<panel>` — one question per panel, so the panel can be named in the stem. */
export function questionKeyFor(panel: string): string {
	return `residual_is_field.${panel}`
}

/**
 * The stem, the spec's wording verbatim, prefixed with the panel it is asked about.
 *
 * The question text after the prefix is byte-identical to the pre-registered sentence, and §12.9
 * pre-registers the *same* sentence §11.11 did (`proposed_question` in the v5 manifest's meta). A
 * round whose stem drifts from the spec that pre-registered its bar is not the round the bar was set
 * for — and two rounds testing one bar with two stems are not two runs of one instrument.
 *
 * Only `answers` and `framing` vary by round. The stem, the preamble and the instruction do not.
 */
export function residualPurityQuestion(
	panel: (typeof RESIDUAL_PANELS)[number],
	answers: readonly OracleAnswerOption[] = RESIDUAL_PURITY_ANSWERS,
	framing: string = RESIDUAL_PURITY_FRAMING,
): OracleQuestion {
	return {
		key: questionKeyFor(panel.key),
		kind: "enum",
		question:
			`${panel.position === "middle" ? "Middle" : "Right"} panel, "${panel.label}" — ` +
			"is everything still visible here background — is there nothing left that belongs to a depicted " +
			"subject, to display text, or to an applied mark?",
		instruction: RESIDUAL_PURITY_INSTRUCTION,
		preamble: RESIDUAL_PURITY_PREAMBLE,
		framing,
		answers,
	}
}

/* ------------------------------------------------------------------------------------------- */
/* The sample manifest                                                                           */
/* ------------------------------------------------------------------------------------------- */

/**
 * One sampled sheet, as `oracle/sam/build_residual_sheets_v4.py` and `…_v5.py` write it.
 *
 * The residual fractions, the contamination causes and the noun fields are typed here **only so they
 * can be left out**: a future edit that copies one of them onto an item has to fail to compile
 * rather than quietly hand the reviewer the answer key.
 *
 * **The two builders do not write the same entry**, and the difference is not cosmetic. v4 asked for
 * one noun and stored one (`subject_noun_prompt`, `subject_noun_raw`, `subject_noun_disposition`);
 * v5 asks for every noun and stores a list (`subject_noun_prompts`, `subject_nouns_all_raw`, plus the
 * counts and the rank tags that fired). v4 stored one guard-ON residual; v5 stores two, because A6's
 * `person_like` exemption landed between the runs and the analysis computes both — `…_uniform` is
 * what the ON panel renders, `…_exempt` is stored per item and is deliberately not a third panel.
 * Both shapes are typed as optional over one required core, so a field that only one builder writes
 * is `undefined` rather than a cast, and `assertNoAnswerKey` bars the names of all of them.
 */
export type ResidualSheetEntry = Readonly<{
	item_id: string
	artwork_id: string
	image_path: string
	sheet: string
	stratum: string
	panel_cut: string
	residual_guard_off: number
	residual_static_guard_off: number
	contamination_causes: readonly string[]
	dynamic_concepts_asked: readonly string[]
	dynamic_concepts_fired: readonly string[]
	subject_kind_agreed: string | null
	/** v4 only. */
	residual_guard_on?: number
	subject_noun_disposition?: string
	subject_noun_prompt?: string | null
	subject_noun_raw?: string | null
	/** v5 only. */
	residual_guard_on_uniform?: number
	residual_guard_on_exempt?: number
	noun_tags_fired?: readonly string[]
	subject_noun_prompts?: readonly string[]
	subject_nouns_all_raw?: readonly string[]
	subject_nouns_barred_count?: number
	subject_nouns_used_count?: number
	v4_single_noun_prompt?: string | null
}>

export type ResidualSheetManifest = Readonly<{
	meta: Readonly<{
		run: string
		seed: number
		panel_cut: string
		panel_cut_note: string
		built_by: string
		built_at: string
		git_head: string
		analysis: string
		derivation_table: string
		note: string
		supersedes: string
		pool_sizes: Readonly<Record<string, number>>
		quotas: Readonly<Record<string, number>>
		/** v5 only — the proposal §12.9 wrote into the manifest before any round was pushed. */
		guard_variants_rendered?: readonly string[]
		population_caveat?: string
		proposed_answers?: readonly Readonly<{ id: string; label: string }>[]
		proposed_bar?: Readonly<Record<string, unknown>>
		proposed_question?: string
		proposed_round_id?: string
	}>
	items: readonly ResidualSheetEntry[]
}>

export async function readResidualSample(path = RESIDUAL_PURITY_SAMPLE_PATH): Promise<ResidualSheetManifest> {
	return JSON.parse(await readFile(path, "utf8")) as ResidualSheetManifest
}

/* ------------------------------------------------------------------------------------------- */
/* The fixture                                                                                   */
/* ------------------------------------------------------------------------------------------- */

export const RESIDUAL_PURITY_SELECTION_RULE =
	"Twenty-five three-panel residual sheets from the sam-eval-142-v4-nouns run (seed 20260804), drawn to " +
	"pre-registered per-stratum quotas over noun-fired [77], noun-silent [10], contaminated [25], class-only [2] " +
	"and static-only-clean [28]; class-only takes both members of its pool, which is why its quota of 3 yields 2. " +
	"The sample is deliberately enriched for hard cases, so the raw rate is NOT a corpus estimate — the bar " +
	"applies to the stratum-reweighted rate, using the bracketed pool sizes as inverse-probability weights. " +
	"Panels are rendered at the SUBTRACTION cut, not config.py's shipped precision cut, because 11 of the 26 " +
	"text gaps sit between the two thresholds and rendering at the precision cut would ask the reviewer to " +
	"judge a threshold choice while believing they were judging an instrument; this is not a proposal to change " +
	"config.py. Each sheet is asked once per residual panel — area guard ON, then area guard OFF — so an item " +
	"is one (sheet, panel) pair and a pass-2 sheet has been seen before, in a different order. What the round " +
	"decides: whether R-3's structural claim is adopted (stratum-reweighted pure-field rate >= 0.75 in at least " +
	"one guard variant, and no single stratum below 0.50), pre-registered in RESIDUAL_EXPERIMENT_NOTES.md §11.11 " +
	"before any answer was seen; and, ungated by that, which guard variant wins more pure-field answers, which " +
	"is evidence for loose end A6's person exemption and for whether it should extend to dyn-noun."

export const RESIDUAL_PURITY_2_SELECTION_RULE =
	"Twenty-four three-panel residual sheets from the sam-eval-142-v5-allnouns run (seed 20260805), drawn to the " +
	"SAME pre-registered per-stratum quotas residual-purity-1 used — noun-fired 8, noun-silent 5, contaminated 6, " +
	"class-only 3, static-only-clean 4 — over v5 pools of noun-fired [102], noun-silent [12], contaminated [20], " +
	"class-only [1] and static-only-clean [7]; class-only takes its whole pool, which is why its quota of 3 yields " +
	"1 and the round is 24 sheets rather than 25. The quotas were HELD rather than rebalanced to recover a round " +
	"number: the all-nouns elicitation prompts almost every cover, so static-only-clean collapsed from 28 to 7 and " +
	"class-only from 2 to 1, and moving a quota to hit a target would be tuning the sampling design to the target. " +
	"The sample is deliberately enriched for hard cases, so the raw rate is NOT a corpus estimate — the bar applies " +
	"to the stratum-reweighted rate, using the bracketed pool sizes as inverse-probability weights. It is not a " +
	"corpus estimate for a second reason either: eval-142 was never a sample of this corpus (cluster-mix total- " +
	"variation distance 0.2273 against coverage-set-1's 0.0851), so this round answers the PAIRED question — did " +
	"the all-nouns elicitation move purity on the same covers residual-purity-1 judged — and not the corpus one, " +
	"whose prescribed re-run is on coverage-set-1. Panels are rendered at the SUBTRACTION cut, not config.py's " +
	"shipped precision cut, because rendering at the precision cut would ask the reviewer to judge a threshold " +
	"choice while believing they were judging an instrument; this is not a proposal to change config.py. Under " +
	"concept set v2.2 that cut is min(pooled, group cut) per group rather than a flat 0.578, because cjk_script's " +
	"cut (0.392655, PROVISIONAL) is below pooled; on the v4 run the two definitions coincide, so no v4 number " +
	"moves. Each sheet is asked once per residual panel — area guard ON, then area guard OFF — so an item is one " +
	"(sheet, panel) pair and a pass-2 sheet has been seen before, in a different order. FOUR answers, not three: " +
	"the escape can't-tell is excluded from both the numerator and the denominator of the pure-field rate, never " +
	"dropped, and its share is reported per stratum as a first-class result, with any stratum above 0.50 escape " +
	"share reported as having no reliable purity rate rather than a low one. What the round decides: whether R-3's " +
	"structural claim is adopted (stratum-reweighted pure-field rate >= 0.75 in at least one guard variant, and no " +
	"single stratum below 0.50) — the SAME bar residual-purity-1 returned 0.2424 against, held and not moved, " +
	"because v5 improved a proxy and that proxy is the one thing already measured to over-claim purity by 0.582; " +
	"and, ungated by that, which guard variant wins more pure-field answers, which is evidence for loose end A6's " +
	"person exemption and for whether it should extend to dyn-noun."

/**
 * Everything that distinguishes one residual-purity round from the other.
 *
 * The two rounds share their stem, preamble, instruction, panels, cut, strata, shuffle and bar. What
 * a spec names is the short list of things that genuinely differ — which manifest, which answers,
 * which framing, and the provenance strings — so that "what changed between the rounds" is answerable
 * by reading one object rather than by diffing two builders.
 */
export type ResidualRoundSpec = Readonly<{
	batchId: string
	labelSchemaVersion: string
	seed: number
	samplePath: string
	fixturePath: string
	answers: readonly OracleAnswerOption[]
	framing: string
	selectionRule: string
	fundedBy: readonly string[]
	/**
	 * Repo-root-relative provenance. Takes the run name rather than listing it, because the run's
	 * `.jsonl` is the one line the manifest already knows and a spec that restated it could disagree
	 * with the sample it was built from.
	 */
	builtFrom: (run: string) => readonly string[]
	/** The run the manifest must name. A round built from the wrong sample is not the pre-registered round. */
	expectedRun: string
}>

/**
 * Build the round from the sample manifest.
 *
 * The sheet's hash and its dimensions are taken from the bytes on disk — the manifest records
 * neither — and the fixture carries them so the push-time custody check has something to compare
 * against: a re-render that moved one pixel is a different stimulus and must fail at build time with
 * the builder named, not later with a hash mismatch nobody can place.
 */
export async function buildResidualPurityFixture(
	options: { round?: ResidualRoundSpec; samplePath?: string; repoRoot?: string; batchId?: string; seed?: number } = {},
): Promise<OracleValidationFixture> {
	const round = options.round ?? RESIDUAL_PURITY_ROUND_1
	const manifest = await readResidualSample(options.samplePath ?? round.samplePath)
	const repoRoot = options.repoRoot ?? REPO_ROOT
	const seed = options.seed ?? round.seed
	const random = mulberry32(seed)
	// The one identity check the builder can make before it has read a single pixel: a spec names the
	// run its pre-registration was written against, and a manifest that names another run is another
	// sample. Failing here says which two runs disagreed; failing later says a hash did not match.
	if (manifest.meta.run !== round.expectedRun) {
		throw new Error(`${round.batchId} is pre-registered against ${round.expectedRun}, but the sample names ${manifest.meta.run}`)
	}
	if (manifest.meta.seed !== seed) {
		throw new Error(`${round.batchId} is pre-registered at seed ${seed}, but the sample was drawn at ${manifest.meta.seed}`)
	}

	// Read every sheet once, not once per panel: two items share one file, and hashing it twice is
	// two chances for the two items to disagree about what they are showing.
	const sheets = new Map<string, { sha256: string; width: number; height: number }>()
	for (const entry of manifest.items) {
		const bytes = await readFile(join(repoRoot, entry.sheet))
		const metadata = await sharp(bytes).metadata()
		if (!Number.isInteger(metadata.width) || !Number.isInteger(metadata.height)) {
			throw new Error(`${entry.item_id}: ${entry.sheet} has no usable image header`)
		}
		sheets.set(entry.item_id, {
			sha256: createHash("sha256").update(bytes).digest("hex"),
			width: metadata.width as number,
			height: metadata.height as number,
		})
	}

	const questions: OracleQuestion[] = []
	const items: OracleValidationItem[] = []
	const serveOrder: string[] = []
	const counts: Record<string, number> = { sheets: manifest.items.length, panels: RESIDUAL_PANELS.length }
	for (const [stratum, count] of countByStratum(manifest.items)) counts[stratum] = count
	// Repo-root-relative and derived, not typed twice: the rendition's `source` and `builtFrom`'s
	// first line must name the same file, and a round that named one manifest in one place and
	// another in the other would be unjoinable in the warehouse in a way nothing would catch.
	const samplePath = relative(repoRoot, options.samplePath ?? round.samplePath).split("\\").join("/")

	for (const panel of RESIDUAL_PANELS) {
		questions.push(residualPurityQuestion(panel, round.answers, round.framing))
		const pass: OracleValidationItem[] = []
		for (const entry of manifest.items) {
			const sheet = sheets.get(entry.item_id)!
			pass.push({
				// One item per (sheet, panel). The panel has to be in the id: two items serving the same
				// file under the same batch would otherwise be indistinguishable in the batch log.
				itemId: `${entry.item_id}.${panel.key}`,
				questionKey: questionKeyFor(panel.key),
				imagePath: entry.sheet,
				sha256: sheet.sha256,
				// The SHEET, not the artwork and not the item: this is the key the analysis joins on, and
				// it is what makes the guard-ON and guard-OFF answers a pair about one subtraction. The
				// (question, image) pair stays unique because the two panels are two questions.
				imageId: entry.item_id,
				artworkId: entry.artwork_id,
				collection: SHEET_COLLECTION,
				rendition: {
					source: samplePath,
					sourceEntryId: entry.item_id,
					longEdgePx: Math.max(sheet.width, sheet.height),
					width: sheet.width,
					height: sheet.height,
				},
				stratum: entry.stratum,
			})
		}
		items.push(...pass)
		// Shuffled independently per pass, from one running generator: the reviewer meets the same
		// sheets twice and they must not arrive in the same order, or pass 2 becomes a memory test.
		serveOrder.push(...stratifiedShuffle(pass, random).map((item) => item.itemId))
	}

	const fixture: OracleValidationFixture = {
		// The server accepts one oracle-validation fixture version; this round is the same shape.
		fixtureVersion: PREMISE_DISAMBIGUATION_FIXTURE_VERSION,
		batchId: options.batchId ?? round.batchId,
		purpose: "oracle-validation",
		labelSchemaVersion: round.labelSchemaVersion,
		seed,
		generatedBy: "research/v3/src/review-server/residual-purity.ts",
		builtFrom: round.builtFrom(manifest.meta.run),
		selection: { rule: round.selectionRule, counts },
		questions,
		items,
		serveOrder,
	}
	validateFixture(fixture)
	assertNoAnswerKey(fixture)
	return fixture
}

function countByStratum(entries: readonly ResidualSheetEntry[]): [string, number][] {
	const byStratum = new Map<string, number>()
	for (const entry of entries) byStratum.set(entry.stratum, (byStratum.get(entry.stratum) ?? 0) + 1)
	return [...byStratum].sort()
}

/**
 * The fixture must not contain any of the numbers or derivations the round is a second opinion about.
 *
 * Checked structurally rather than trusted. `stratum` legitimately stays on the items — the analysis
 * needs it for the reweighting and the server never serves it — but a residual fraction sitting
 * beside the panel it grades would decide the answer, and so would the noun that was subtracted.
 */
export function assertNoAnswerKey(fixture: OracleValidationFixture): void {
	const text = JSON.stringify({ items: fixture.items, questions: fixture.questions })
	for (const forbidden of [
		"residual_guard",
		"residual_static",
		"residualGuard",
		"contamination_causes",
		"contaminationCauses",
		"subject_noun",
		"subjectNoun",
		"dynamic_concepts",
		"dyn-noun",
		"subject_kind",
		// v5's additions. `subject_noun` above already covers `subject_noun_prompts` and
		// `subject_nouns_all_raw` by prefix, and `residual_guard` covers both guard-ON variants; these
		// three are the names it does not reach.
		"noun_tags",
		"nounTags",
		"v4_single_noun",
	]) {
		if (text.includes(forbidden)) throw new Error(`the residual-purity fixture leaks ${forbidden}`)
	}
}

/* ------------------------------------------------------------------------------------------- */
/* Pushing                                                                                       */
/* ------------------------------------------------------------------------------------------- */

/**
 * What funds this round (REVIEW_UI.md §7), stated so the warehouse can answer "what evidence funded
 * this decision" without archaeology.
 */
export const RESIDUAL_PURITY_FUNDED_BY: readonly string[] = [
	"RESIDUAL_EXPERIMENT_NOTES.md §11.11 — the pre-registered residual-purity v4 round; the adoption bar " +
		"(stratum-reweighted pure-field >= 0.75 in at least one guard variant, no stratum below 0.50) was fixed " +
		"before any answer was seen and supersedes §8's",
	"RESIDUAL_EXPERIMENT_NOTES.md §11.1 — the sam-eval-142-v4-nouns run: 142/142 covers, 5,115 region rows, " +
		"one canary fingerprint, which is what these 25 sheets were rendered from",
	"ruling R-3 — background structure becomes a pixel computation. Adopted only on this round's evidence; " +
		"otherwise the residual stays what round 2 called it, a field-enriched prior",
	"PHASE_0_LOOSE_ENDS.md A6 — the area guard's person exemption: the ON/OFF pair is the first evidence about " +
		"whether it should extend to dyn-noun (ruling R-2)",
	`selection: ${RESIDUAL_PURITY_SELECTION_RULE}`,
]

/**
 * What funds round 2.
 *
 * It names four things round 1's list could not: the successor pre-registration, the run whose
 * elicitation is what actually changed, the verdict that made the round necessary, and the decision
 * record the fourth answer is proposed under. The verdict line is here because the round is not
 * self-explanatory without it — a reader who does not know that this bar has already been returned
 * 0.2424 against cannot tell whether 0.75 is ambitious or routine.
 */
export const RESIDUAL_PURITY_2_FUNDED_BY: readonly string[] = [
	"RESIDUAL_V5_NOTES.md §12.9 — the pre-registered residual-purity-2 round. It SUCCEEDS §11.11 rather than " +
		"replacing it: §11.11 was consumed by residual-purity-1, which ran. The adoption bar (stratum-reweighted " +
		"pure-field >= 0.75 in at least one guard variant, no stratum below 0.50) is §11.11's, held and not moved, " +
		"and was fixed before any answer was seen. §12 lives in RESIDUAL_V5_NOTES.md rather than in " +
		"RESIDUAL_EXPERIMENT_NOTES.md only because that file was carrying another agent's parked staged edit",
	"RESIDUAL_V5_NOTES.md §12.1–§12.6 — the sam-eval-142-v5-allnouns run: 142/142 covers, 7,431 region rows, one " +
		"canary fingerprint, under the list-ALL-things elicitation (subject-nouns-all.v1 variant J, 830 entries over " +
		"142 covers). 98 of 142 covers now fire a mask from a noun ranked below first, which is the structural cause " +
		"of the flame and the cello removed; these 24 sheets were rendered from it. The static arm was verified " +
		"byte-identical to v4 region for region (4,867 of 4,867), so v5-against-v4 compares elicitations",
	"RESIDUAL_PURITY_VERDICT.md — residual-purity-1 returned NOT-ADOPT at a reweighted pure-field rate of 0.2424, " +
		"every stratum below the 0.50 floor, against a proxy that had called 82.4% of the same residuals clean: the " +
		"proxy over-claimed by a measured 0.582. That is why v5's proxy improvement (0.8239 -> 0.8592) does not move " +
		"the bar, and why this round is the only thing that can decide R-3",
	"proposed decision record d-2026-08-04-purity-rounds-need-escape-answer — the fourth answer, required by design " +
		"rule 8 (a slot must be able to record the answer). The reviewer after round 1: 'sometimes it's hard to tell " +
		"what is field and what is subject, so answers for those cases are not reliable (even with human feedback) " +
		"unless we add an escape answer choice.' GROUND_FREETEXT_SYNTHESIS.md independently found 3 of 9 covers " +
		"ambiguous in unconstrained prose. Scoring is pre-registered: excluded from numerator and denominator, never " +
		"dropped, share reported per stratum as a first-class ambiguity measurement",
	"ruling R-3 — background structure becomes a pixel computation. Adopted only on this round's evidence; " +
		"otherwise the residual stays what round 2 called it, a field-enriched prior",
	"PHASE_0_LOOSE_ENDS.md A6 — the area guard's person exemption: the ON/OFF pair is further evidence about " +
		"whether it should extend to dyn-noun (ruling R-2), which v5 raises the stakes on — eight rank tags per " +
		"cover is eight times the exposure, and dyn-noun-N is still not guard-exempt",
	`selection: ${RESIDUAL_PURITY_2_SELECTION_RULE}`,
]

/**
 * The two rounds, as data.
 *
 * Declared after the constants they name, so nothing here is read before it is initialised, and
 * consumed only through `buildResidualPurityFixture`'s `round` option.
 */
export const RESIDUAL_PURITY_ROUND_1: ResidualRoundSpec = {
	batchId: RESIDUAL_PURITY_BATCH_ID,
	labelSchemaVersion: RESIDUAL_PURITY_LABEL_SCHEMA_VERSION,
	seed: RESIDUAL_PURITY_SEED,
	samplePath: RESIDUAL_PURITY_SAMPLE_PATH,
	fixturePath: RESIDUAL_PURITY_FIXTURE_PATH,
	answers: RESIDUAL_PURITY_ANSWERS,
	framing: RESIDUAL_PURITY_FRAMING,
	selectionRule: RESIDUAL_PURITY_SELECTION_RULE,
	fundedBy: RESIDUAL_PURITY_FUNDED_BY,
	builtFrom: (run) => [
		"research/v3/data/sam/residual-sheets-v4-sample.json",
		`research/v3/data/sam/${run}.jsonl`,
		"research/v3/oracle/sam/build_residual_sheets_v4.py",
		"research/v3/oracle/sam/RESIDUAL_EXPERIMENT_NOTES.md",
	],
	expectedRun: "sam-eval-142-v4-nouns",
}

export const RESIDUAL_PURITY_ROUND_2: ResidualRoundSpec = {
	batchId: RESIDUAL_PURITY_2_BATCH_ID,
	labelSchemaVersion: RESIDUAL_PURITY_2_LABEL_SCHEMA_VERSION,
	seed: RESIDUAL_PURITY_2_SEED,
	samplePath: RESIDUAL_PURITY_2_SAMPLE_PATH,
	fixturePath: RESIDUAL_PURITY_2_FIXTURE_PATH,
	answers: RESIDUAL_PURITY_2_ANSWERS,
	framing: RESIDUAL_PURITY_2_FRAMING,
	selectionRule: RESIDUAL_PURITY_2_SELECTION_RULE,
	fundedBy: RESIDUAL_PURITY_2_FUNDED_BY,
	builtFrom: (run) => [
		"research/v3/data/sam/residual-sheets-v5-sample.json",
		`research/v3/data/sam/${run}.jsonl`,
		"research/v3/oracle/sam/build_residual_sheets_v5.py",
		// NOT RESIDUAL_EXPERIMENT_NOTES.md: §12 could not be appended to it, so §12.9 — the
		// pre-registration this round's bar comes from — is here. When the parked set lands and §12 is
		// folded in, this line moves and nothing else does.
		"research/v3/oracle/sam/RESIDUAL_V5_NOTES.md",
	],
	expectedRun: "sam-eval-142-v5-allnouns",
}

export const RESIDUAL_ROUNDS: Readonly<Record<string, ResidualRoundSpec>> = {
	1: RESIDUAL_PURITY_ROUND_1,
	2: RESIDUAL_PURITY_ROUND_2,
}

/** Minimal structural view of the review service, so this file does not import the server. */
type PushTarget = {
	has(batchId: string): boolean
	pushOracleValidation(
		fixture: OracleValidationFixture,
		fundedBy?: readonly string[],
		batchId?: string,
	): Promise<{ batchId: string; itemCount: number }>
}

/**
 * Push the round if it is not in the queue yet. Idempotent by batch id.
 *
 * `fundedBy` travels with the round rather than being looked up from the batch id, because the two
 * rounds' lists differ and a round pushed with the other one's provenance would be unfalsifiable
 * afterwards: the warehouse would say residual-purity-2 was funded by §11.11, and nothing would ever
 * contradict it.
 */
export async function seedResidualPurityRound(
	service: PushTarget,
	fixturePath = RESIDUAL_PURITY_FIXTURE_PATH,
	batchId = RESIDUAL_PURITY_BATCH_ID,
	fundedBy: readonly string[] = RESIDUAL_PURITY_FUNDED_BY,
): Promise<string | null> {
	const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as OracleValidationFixture
	if (service.has(batchId)) return null
	const pushed = await service.pushOracleValidation(fixture, fundedBy, batchId)
	return pushed.batchId
}

/** Seed round 2, for a caller that should not have to remember three arguments to get it right. */
export async function seedResidualPurity2Round(service: PushTarget): Promise<string | null> {
	return seedResidualPurityRound(
		service,
		RESIDUAL_PURITY_2_FIXTURE_PATH,
		RESIDUAL_PURITY_2_BATCH_ID,
		RESIDUAL_PURITY_2_FUNDED_BY,
	)
}

/** Push over HTTP, for a server that is already running. Returns what the server replied. */
export async function pushResidualPurityRound(
	base: string,
	fixturePath = RESIDUAL_PURITY_FIXTURE_PATH,
	fundedBy: readonly string[] = RESIDUAL_PURITY_FUNDED_BY,
): Promise<{ status: number; body: unknown }> {
	const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as OracleValidationFixture
	const response = await fetch(`${base}/api/oracle-validation`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ fixture, fundedBy }),
	})
	const text = await response.text()
	return { status: response.status, body: text.length === 0 ? null : JSON.parse(text) }
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			round: { type: "string", default: "1" },
			write: { type: "boolean", default: false },
			push: { type: "string" },
		},
		strict: true,
	})
	const round = RESIDUAL_ROUNDS[values.round]
	if (round === undefined) throw new Error(`--round must be one of ${Object.keys(RESIDUAL_ROUNDS).join(", ")}, not ${values.round}`)
	const fixture = await buildResidualPurityFixture({ round })
	process.stdout.write(`${fixture.batchId}: ${fixture.items.length} items, ${fixture.questions.length} passes\n`)
	for (const question of fixture.questions) {
		const count = fixture.items.filter((item) => item.questionKey === question.key).length
		process.stdout.write(`  ${question.key.padEnd(28)} ${String(count).padStart(3)}  ${question.question}\n`)
	}
	process.stdout.write(`  answers: ${round.answers.map((answer) => `${answer.hotkey}=${answer.key}`).join("  ")}\n`)
	const byStratum = new Map<string, number>()
	for (const item of fixture.items) byStratum.set(item.stratum, (byStratum.get(item.stratum) ?? 0) + 1)
	process.stdout.write("  items per stratum (two per sheet, one per residual panel):\n")
	for (const [stratum, count] of [...byStratum].sort()) {
		process.stdout.write(`    ${stratum.padEnd(26)} ${String(count).padStart(3)} items  ${count / 2} sheets\n`)
	}
	if (values.write) {
		await writeFile(round.fixturePath, serializeFixture(fixture))
		process.stdout.write(`wrote ${round.fixturePath}\n`)
	}
	if (values.push !== undefined) {
		const pushed = await pushResidualPurityRound(values.push, round.fixturePath, round.fundedBy)
		process.stdout.write(`pushed to ${values.push}: ${pushed.status} ${JSON.stringify(pushed.body)}\n`)
	}
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
	await main()
}
