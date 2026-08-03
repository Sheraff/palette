/**
 * The residual-purity round — `residual-purity-1`, the reviewer's answer to the one question the
 * residual numbers cannot answer themselves: **is what remains after the subject masks are
 * subtracted actually background?**
 *
 * Pre-registered in `oracle/sam/RESIDUAL_EXPERIMENT_NOTES.md` §11.11, which supersedes §8. The
 * sheets, the sample, the strata, the quotas and the adoption bar were all fixed before any answer
 * was seen; nothing in this file chooses any of them. It reads
 * `data/sam/residual-sheets-v4-sample.json` and turns it into a round.
 *
 * **A leaf file, like `sam-mask-quality.ts` beside it.** It builds an `OracleValidationFixture` and
 * imports; nothing in `oracle-validation.ts`, `server.ts` or the page is modified, and the round
 * needs no new serve mode: it is an ordinary `by-question` round with two passes.
 *
 * ## Why two questions over 25 sheets, and not one
 *
 * Each sheet is three panels — **artwork | what remains, area guard ON | what remains, area guard
 * OFF** — and §11.11 asks its question **once per panel**. The bar it pre-registers is stated per
 * guard variant ("≥ 0.75 in at least one guard variant"), and its second, ungated clause compares
 * the two variants against each other for A6's `person` exemption. A single answer per sheet could
 * fund neither. So the round asks the same question twice, once naming each residual panel, and an
 * item is one **(sheet, panel)** pair: 25 sheets, 50 items, two contiguous passes — `labelUnit` in
 * REVIEW_UI.md §6's sense is (image, question), not image.
 *
 * The cost is stated rather than hidden, the same way the mask-quality round states its own: the
 * second pass shows the reviewer 25 sheets they have already seen, so a pass-2 answer can be
 * anchored on the pass-1 answer for the same sheet. Two things hold it down — the two passes are
 * shuffled independently, so the sheets do not arrive in the same order twice, and the panel being
 * judged is named in the stem and labelled on the sheet. The analysis reports the pair, per sheet;
 * it does not average the anchoring away.
 *
 * ## What is kept away from the reviewer
 *
 * Every number this round exists to be a second opinion about: `residual_guard_on`,
 * `residual_guard_off`, `residual_static_guard_off`, the contamination causes, the noun that was
 * prompted and its disposition, the fired concepts. All of it stays in the manifest, which the
 * analysis re-joins by `item_id` after release — the same discipline as the mask-quality round.
 * `assertNoAnswerKey` checks it structurally rather than trusting this comment.
 *
 * Regenerate the committed fixture (sheets must exist first — `oracle/sam/build_residual_sheets_v4.py`):
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *     research/v3/src/review-server/residual-purity.ts --write
 */
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
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
 * The three answers, one keystroke each (REVIEW_UI.md §6).
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

/** `residual_is_field.<panel>` — one question per panel, so the panel can be named in the stem. */
export function questionKeyFor(panel: string): string {
	return `residual_is_field.${panel}`
}

/**
 * The stem, §11.11's wording verbatim, prefixed with the panel it is asked about.
 *
 * The question text after the prefix is byte-identical to the pre-registered sentence. A round whose
 * stem drifts from the spec that pre-registered its bar is not the round the bar was set for.
 */
export function residualPurityQuestion(panel: (typeof RESIDUAL_PANELS)[number]): OracleQuestion {
	return {
		key: questionKeyFor(panel.key),
		kind: "enum",
		question:
			`${panel.position === "middle" ? "Middle" : "Right"} panel, "${panel.label}" — ` +
			"is everything still visible here background — is there nothing left that belongs to a depicted " +
			"subject, to display text, or to an applied mark?",
		instruction: RESIDUAL_PURITY_INSTRUCTION,
		preamble: RESIDUAL_PURITY_PREAMBLE,
		framing: RESIDUAL_PURITY_FRAMING,
		answers: RESIDUAL_PURITY_ANSWERS,
	}
}

/* ------------------------------------------------------------------------------------------- */
/* The sample manifest                                                                           */
/* ------------------------------------------------------------------------------------------- */

/**
 * One sampled sheet, as `oracle/sam/build_residual_sheets_v4.py` writes it.
 *
 * The residual fractions, the contamination causes and the noun fields are typed here **only so they
 * can be left out**: a future edit that copies one of them onto an item has to fail to compile
 * rather than quietly hand the reviewer the answer key.
 */
export type ResidualSheetEntry = Readonly<{
	item_id: string
	artwork_id: string
	image_path: string
	sheet: string
	stratum: string
	panel_cut: string
	residual_guard_on: number
	residual_guard_off: number
	residual_static_guard_off: number
	contamination_causes: readonly string[]
	dynamic_concepts_asked: readonly string[]
	dynamic_concepts_fired: readonly string[]
	subject_kind_agreed: string | null
	subject_noun_disposition: string
	subject_noun_prompt: string | null
	subject_noun_raw: string | null
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

/**
 * Build the round from the sample manifest.
 *
 * The sheet's hash and its dimensions are taken from the bytes on disk — the manifest records
 * neither — and the fixture carries them so the push-time custody check has something to compare
 * against: a re-render that moved one pixel is a different stimulus and must fail at build time with
 * the builder named, not later with a hash mismatch nobody can place.
 */
export async function buildResidualPurityFixture(
	options: { samplePath?: string; repoRoot?: string; batchId?: string; seed?: number } = {},
): Promise<OracleValidationFixture> {
	const manifest = await readResidualSample(options.samplePath)
	const repoRoot = options.repoRoot ?? REPO_ROOT
	const seed = options.seed ?? RESIDUAL_PURITY_SEED
	const random = mulberry32(seed)

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

	for (const panel of RESIDUAL_PANELS) {
		questions.push(residualPurityQuestion(panel))
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
					source: "research/v3/data/sam/residual-sheets-v4-sample.json",
					sourceEntryId: entry.item_id,
					longEdgePx: Math.max(sheet.width, sheet.height),
					width: sheet.width,
					height: sheet.height,
				},
				stratum: entry.stratum,
			})
		}
		items.push(...pass)
		// Shuffled independently per pass, from one running generator: the reviewer meets the same 25
		// sheets twice and they must not arrive in the same order, or pass 2 becomes a memory test.
		serveOrder.push(...stratifiedShuffle(pass, random).map((item) => item.itemId))
	}

	const fixture: OracleValidationFixture = {
		// The server accepts one oracle-validation fixture version; this round is the same shape.
		fixtureVersion: PREMISE_DISAMBIGUATION_FIXTURE_VERSION,
		batchId: options.batchId ?? RESIDUAL_PURITY_BATCH_ID,
		purpose: "oracle-validation",
		labelSchemaVersion: RESIDUAL_PURITY_LABEL_SCHEMA_VERSION,
		seed,
		generatedBy: "research/v3/src/review-server/residual-purity.ts",
		builtFrom: [
			"research/v3/data/sam/residual-sheets-v4-sample.json",
			`research/v3/data/sam/${manifest.meta.run}.jsonl`,
			"research/v3/oracle/sam/build_residual_sheets_v4.py",
			"research/v3/oracle/sam/RESIDUAL_EXPERIMENT_NOTES.md",
		],
		selection: { rule: RESIDUAL_PURITY_SELECTION_RULE, counts },
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

/** Minimal structural view of the review service, so this file does not import the server. */
type PushTarget = {
	has(batchId: string): boolean
	pushOracleValidation(
		fixture: OracleValidationFixture,
		fundedBy?: readonly string[],
		batchId?: string,
	): Promise<{ batchId: string; itemCount: number }>
}

/** Push the round if it is not in the queue yet. Idempotent by batch id. */
export async function seedResidualPurityRound(
	service: PushTarget,
	fixturePath = RESIDUAL_PURITY_FIXTURE_PATH,
	batchId = RESIDUAL_PURITY_BATCH_ID,
): Promise<string | null> {
	const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as OracleValidationFixture
	if (service.has(batchId)) return null
	const pushed = await service.pushOracleValidation(fixture, RESIDUAL_PURITY_FUNDED_BY, batchId)
	return pushed.batchId
}

/** Push over HTTP, for a server that is already running. Returns what the server replied. */
export async function pushResidualPurityRound(
	base: string,
	fixturePath = RESIDUAL_PURITY_FIXTURE_PATH,
): Promise<{ status: number; body: unknown }> {
	const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as OracleValidationFixture
	const response = await fetch(`${base}/api/oracle-validation`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ fixture, fundedBy: RESIDUAL_PURITY_FUNDED_BY }),
	})
	const text = await response.text()
	return { status: response.status, body: text.length === 0 ? null : JSON.parse(text) }
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: { write: { type: "boolean", default: false }, push: { type: "string" } },
		strict: true,
	})
	const fixture = await buildResidualPurityFixture()
	process.stdout.write(`${fixture.batchId}: ${fixture.items.length} items, ${fixture.questions.length} passes\n`)
	for (const question of fixture.questions) {
		const count = fixture.items.filter((item) => item.questionKey === question.key).length
		process.stdout.write(`  ${question.key.padEnd(28)} ${String(count).padStart(3)}  ${question.question}\n`)
	}
	const byStratum = new Map<string, number>()
	for (const item of fixture.items) byStratum.set(item.stratum, (byStratum.get(item.stratum) ?? 0) + 1)
	process.stdout.write("  items per stratum (two per sheet, one per residual panel):\n")
	for (const [stratum, count] of [...byStratum].sort()) {
		process.stdout.write(`    ${stratum.padEnd(26)} ${String(count).padStart(3)} items  ${count / 2} sheets\n`)
	}
	if (values.write) {
		await writeFile(RESIDUAL_PURITY_FIXTURE_PATH, serializeFixture(fixture))
		process.stdout.write(`wrote ${RESIDUAL_PURITY_FIXTURE_PATH}\n`)
	}
	if (values.push !== undefined) {
		const pushed = await pushResidualPurityRound(values.push)
		process.stdout.write(`pushed to ${values.push}: ${pushed.status} ${JSON.stringify(pushed.body)}\n`)
	}
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
	await main()
}
