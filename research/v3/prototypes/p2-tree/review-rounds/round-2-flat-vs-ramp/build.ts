/**
 * P2 round 2 — flat vs gradient. Ground-truth round about ARTWORKS; no palette is ever shown.
 *
 * Round 1 returned a reviewer note that priced a constant nobody had priced: on one cover the
 * published reading was "almost very good, but this artwork is flat, not a gradient". The follow-up
 * measurement found the decision unsettleable against the only labels we hold — 0 of 77 parameter
 * cells survive their own multiplicity correction, and the shipped operating point publishes a
 * progression on 69% of the covers where it publishes one at all, against those labels. A cut that
 * cannot be settled by legacy labels has to be settled by the person whose judgement the product is
 * for. That is this round: eight artworks, one question, no palettes, no candidate on screen.
 *
 * WHAT IS DELIBERATELY ABSENT FROM `fixture.json`
 * Every string that could tell the reviewer what to answer, or which side of a comparison an
 * artwork sits on: the candidate and family names, the constants under test, the five-way verdict
 * vocabulary, the per-item legacy gradient boolean, and the path of the study that produced the
 * eight paths. All of it is in `ROUND.md`, which is an orchestrator document and is not servable —
 * the same arrangement round 1 used for `mapping.private.json`. Nothing was dropped; it was moved.
 * `validate.ts` scans the fixture's raw bytes and fails on any of it.
 *
 * Deterministic: the selection is a filter over a committed report plus sorts on image path, the
 * serve order is a seeded shuffle, and a second run reproduces `fixture.json` byte for byte.
 *
 * Build:
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types build.ts
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types validate.ts
 */
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { mulberry32 } from "../../../../src/contract/calibration/same-color-bar-translation.ts"
import { deriveCollection } from "../../../../src/review-server/batch.ts"
import {
	serializeFixture,
	tierOf,
	validateFixture,
	type OracleQuestion,
	type OracleValidationFixture,
	type OracleValidationItem,
} from "../../../../src/review-server/oracle-validation.ts"

const HERE = fileURLToPath(new URL("./", import.meta.url))
const REPO_ROOT = fileURLToPath(new URL("../../../../../../", import.meta.url))
const FIXTURE_PATH = join(HERE, "fixture.json")

/** The wire shape is the oracle-validation fixture's, unchanged; only the question set is new. */
export const FIXTURE_VERSION = "oracle-validation-1"
/**
 * Neutral, and deliberately so.
 *
 * The first staging of this round was aborted at install for a blinding defect: the batch id and the
 * schema version both carried the prototype token. Neither is an internal note — the schema version
 * drives page routing and the batch id is on screen — so both would have told the reviewer whose
 * reading they were about to underwrite, on a round whose entire value is that they answer about the
 * artwork with nothing else on screen. Every served string is now free of prototype, arm and round
 * tokens; the true names live in the round's own directory. `validate.ts` enforces it.
 */
export const BATCH_ID = "field-gradient-labels-1"

/**
 * A NEW schema version, rather than a reuse of the standing ground-structure one.
 *
 * The standing `ground_type` question (`group-a.v2`) is close enough in vocabulary that reuse was
 * the first thing considered, and it was rejected on two facts, either of which is sufficient:
 *
 * 1. One of the eight artworks already carries a live `ground_type` answer from an earlier round.
 *    The server keys an answer by `(questionKey, imageId)`, so re-asking `ground_type` here would
 *    write a second standing label for that pair with nothing saying which is current — and this
 *    round is not a supersession of that one, so `supersedesBatchId` would be a lie.
 * 2. `group-a.v2` offers no escape. Its six answers are all substantive readings of the ground;
 *    a reviewer who genuinely cannot judge the field has to file a reading anyway, and a forced
 *    reading is exactly the evidence a calibration target must not be built on.
 *
 * The vocabulary is also narrower on purpose. `group-a.v2` splits the not-flat-not-gradient case
 * three ways; this round does not need that split to answer its question, and every extra key is
 * another way for two rounds' answers to be incomparable.
 */
export const LABEL_SCHEMA_VERSION = "field-gradient-labels.v1"
export const QUESTION_KEY = "field-gradient"
/** The aborted first staging's id. Kept only so `validate.ts` can prove the scan catches it. */
export const RETIRED_LABEL_SCHEMA_VERSION = "p2-field-gradient.v1"
/** Fixed so the committed serve order is reproducible. [UNCALIBRATED] — the build date. */
export const SEED = 20260804

/** The reviewer's own cover from round 1 — the note that opened this question. */
const ANCHOR_PATH = "00/ab67616d00001e02000018e9b0ec8fc5ac790164.jpg"

const REPORT_PATH = fileURLToPath(
	new URL("../../tos/stability/q2-laminarity/report.json", import.meta.url),
)
const EVAL_SET_PATH = fileURLToPath(new URL("../../../../data/oracle-premise/eval-set.json", import.meta.url))
const EVAL_SET_REL = "research/v3/data/oracle-premise/eval-set.json"
/**
 * Logical names, not repository paths — the one place this round departs from the other fixtures'
 * convention, and it is the blinding defect's doing.
 *
 * `generatedBy` and `builtFrom` are fields of a served fixture, and this round's builder and round
 * document live at paths that name the prototype and the round. A true path there is a leak in a
 * field nobody thinks of as reviewer-visible, which is exactly how the first staging failed. The
 * resolution — logical name → true repository path — is a table in the round document, so the
 * provenance is not lost, it is one hop away and out of the served payload.
 */
const BUILDER_REL = "field-gradient-labels/build.ts"
const ROUND_REL = "field-gradient-labels/ROUND.md"

/* ------------------------------------------------------------------------------------------- */
/* The question                                                                                  */
/* ------------------------------------------------------------------------------------------- */

/**
 * One question, four answers, one keystroke each.
 *
 * The preamble fixes the referent before the question is asked, because "the background" is the
 * word that broke an earlier round: a singular referent is unanswerable on an artwork whose ground
 * has two halves. The framing states the criterion in plain language — what the field DOES across
 * itself, not what it depicts — and says outright that the escape is a real answer, because a round
 * whose whole output is a calibration target cannot afford answers filed under duress.
 */
export const FIELD_GRADIENT_QUESTION: OracleQuestion = {
	key: QUESTION_KEY,
	kind: "enum",
	question: "Look at this artwork's background field. Which of these is it?",
	instruction:
		"Answer this one artwork only, from your first read. Do not deliberate, and do not try to make " +
		"your answers across the eight artworks tell one story.",
	preamble:
		"The BACKGROUND FIELD is the large area behind and around whatever is in front of it — subject, " +
		"figures, lettering, logo. Judge that area and nothing else, and judge it AS A WHOLE, even when it " +
		"is made of several parts.",
	framing:
		"The test is what the field DOES across itself, not what it is a picture of. One colour all over " +
		"is flat — and near enough to one colour that you would happily describe the whole field with a " +
		"single colour still counts as flat. A continuous progression is a gradient: a fade, a glow, a " +
		"vignette, colours melting into one another, even a subtle one, even between two colours that are " +
		"close together. Two or more separate colour areas meeting each other is NEITHER, however soft or " +
		"blurry the join between them looks — softness of a join is never the test. A repeating pattern, a " +
		"material like paper or concrete, or a field you simply cannot read as having any overall colour behaviour is also " +
		"neither. If the artwork does not give you a field you can judge at all, \"can't tell\" is a real " +
		"answer; it is measured, not penalized.",
	answers: [
		{
			key: "flat",
			label: "flat",
			gloss: "one colour — or close enough that a single colour represents the whole field",
			hotkey: "1",
		},
		{
			key: "gradient",
			label: "gradient",
			gloss: "a continuous progression between two or more colours, across the field",
			hotkey: "2",
		},
		{
			key: "neither",
			label: "neither",
			gloss: "several distinct colour areas, a pattern or material texture, or no readable field at all",
			hotkey: "3",
		},
		{
			key: "cant_tell",
			label: "can't tell",
			gloss: "you cannot tell",
			hotkey: "u",
		},
	],
}

/* ------------------------------------------------------------------------------------------- */
/* Selection                                                                                     */
/* ------------------------------------------------------------------------------------------- */

type ReportFlip = Readonly<{ imagePath: string; legacyGradient: boolean | null }>
type ReportFlipSet = Readonly<{ role: string; flipped: readonly ReportFlip[] }>

/** Category names are this file's and this round's; they never reach the fixture. */
export type Category = "anchor" | "legacy-ramp-regression" | "legacy-flat-fix" | "unlabelled"

export type Selected = Readonly<{ imagePath: string; category: Category; backfilled: boolean }>

async function readFlipSets(): Promise<Map<string, readonly ReportFlip[]>> {
	const report = JSON.parse(await readFile(REPORT_PATH, "utf8")) as { flips: readonly ReportFlipSet[] }
	return new Map(report.flips.map((set) => [set.role, set.flipped]))
}

/**
 * The rule, executed rather than described.
 *
 * Ordering inside every category is a sort over the image path, so no artwork was chosen for how it
 * looks. The anchor is taken first and removed from every later pool, which matters because it is
 * itself an unlabelled flip: without the removal it would be drawn twice and the round would be
 * seven artworks wearing eight names.
 */
export function select(
	primary: readonly ReportFlip[],
	backfill: readonly ReportFlip[],
): { selected: readonly Selected[]; substitutions: readonly string[] } {
	const taken = new Set<string>()
	const selected: Selected[] = []
	const substitutions: string[] = []

	const anchor = primary.find((flip) => flip.imagePath === ANCHOR_PATH)
	if (anchor === undefined) throw new Error(`the anchor ${ANCHOR_PATH} is not in the primary flip set`)
	selected.push({ imagePath: ANCHOR_PATH, category: "anchor", backfilled: false })
	taken.add(ANCHOR_PATH)

	const pool = (flips: readonly ReportFlip[], want: ReportFlip["legacyGradient"]) =>
		[...flips]
			.filter((flip) => flip.legacyGradient === want && !taken.has(flip.imagePath))
			.sort((a, b) => (a.imagePath < b.imagePath ? -1 : a.imagePath > b.imagePath ? 1 : 0))

	const draw = (category: Category, want: ReportFlip["legacyGradient"], count: number) => {
		for (const flip of pool(primary, want).slice(0, count)) {
			selected.push({ imagePath: flip.imagePath, category, backfilled: false })
			taken.add(flip.imagePath)
		}
		let short = count - selected.filter((item) => item.category === category).length
		if (short <= 0) return
		for (const flip of pool(backfill, want).slice(0, short)) {
			selected.push({ imagePath: flip.imagePath, category, backfilled: true })
			taken.add(flip.imagePath)
			substitutions.push(`${category}: ${flip.imagePath} taken from the backfill set`)
			short -= 1
		}
		if (short > 0) throw new Error(`category ${category} is ${short} short in both flip sets`)
	}

	draw("legacy-ramp-regression", true, 3)
	draw("legacy-flat-fix", false, 2)
	draw("unlabelled", null, 2)

	if (selected.length !== 8) throw new Error(`selection produced ${selected.length} items, not 8`)
	return { selected, substitutions }
}

/* ------------------------------------------------------------------------------------------- */
/* Item rows                                                                                     */
/* ------------------------------------------------------------------------------------------- */

type EvalSetEntry = Readonly<{
	entryId: string
	image: Readonly<{ imageId: string; imagePath: string; sha256: string; width: number; height: number; longEdgePx: number; artworkId: string }>
}>

/**
 * The sharded corpus names an artwork by the tail of its file stem; the dev set names it by the
 * stem. [INHERITED] — `eval-set.json`'s own `artworkIdScheme`, replicated here for the three
 * artworks that have no eval-set row.
 */
function identify(imagePath: string): { imageId: string; artworkId: string } {
	const base = imagePath.slice(imagePath.lastIndexOf("/") + 1)
	const collection = deriveCollection(imagePath)
	if (collection === "sharded-corpus") {
		const stem = base.includes(".") ? base.slice(0, base.lastIndexOf(".")) : base
		return { imageId: base, artworkId: stem.slice(16) }
	}
	return { imageId: base, artworkId: base.includes(".") ? base.slice(0, base.lastIndexOf(".")) : base }
}

async function buildItem(imagePath: string, evalSet: ReadonlyMap<string, EvalSetEntry>): Promise<OracleValidationItem> {
	const bytes = await readFile(join(REPO_ROOT, imagePath))
	const sha256 = createHash("sha256").update(bytes).digest("hex")
	// Dimensions come from the file header, never from a filename or a cached table (CONVENTIONS.md).
	const meta = await sharp(bytes).metadata()
	if (meta.width === undefined || meta.height === undefined) throw new Error(`${imagePath} has no readable dimensions`)
	const longEdgePx = Math.max(meta.width, meta.height)

	const entry = evalSet.get(imagePath)
	if (entry !== undefined) {
		if (entry.image.sha256 !== sha256) throw new Error(`${imagePath} does not match its eval-set hash`)
		if (entry.image.width !== meta.width || entry.image.height !== meta.height) {
			throw new Error(`${imagePath} header disagrees with its eval-set dimensions`)
		}
	}
	const { imageId, artworkId } = identify(imagePath)
	if (entry !== undefined && (entry.image.imageId !== imageId || entry.image.artworkId !== artworkId)) {
		throw new Error(`${imagePath} identity disagrees with its eval-set row`)
	}

	return {
		// Content-derived and opaque: it names the artwork, and nothing about why it is here.
		itemId: `fg-${sha256.slice(0, 12)}`,
		questionKey: QUESTION_KEY,
		imagePath,
		sha256,
		imageId,
		artworkId,
		collection: deriveCollection(imagePath),
		rendition: {
			// Five of the eight are eval-set rows and join back by its own entry id; the other three
			// are corpus files with no eval-set row, and the builder is what fixed their rendition.
			source: entry === undefined ? BUILDER_REL : EVAL_SET_REL,
			sourceEntryId: entry === undefined ? sha256.slice(0, 16) : entry.entryId,
			longEdgePx,
			width: meta.width,
			height: meta.height,
		},
		stratum: tierOf(longEdgePx),
	}
}

/* ------------------------------------------------------------------------------------------- */
/* Fixture                                                                                       */
/* ------------------------------------------------------------------------------------------- */

/**
 * Plain language, aggregate only.
 *
 * It says who is in the batch and why without saying which artwork is which: the four categories
 * are named, their sizes are given, and no artwork is attached to one. The `items` array is sorted
 * by content hash for the same reason, so position in the file carries no category either.
 */
const SELECTION_RULE =
	"Eight artworks, chosen before any of them was looked at. One is an artwork whose earlier reading " +
	"raised the question this round asks; it is the anchor and it is drawn " +
	"first. The other seven come from a committed set of covers whose automatic field reading changes " +
	"when a single parameter of that reading is moved to its literal value — the change under " +
	"consideration. Those covers are split by what the legacy corpus records about them: three where " +
	"the legacy record says the field is a progression and the change would stop calling it one (the " +
	"costliest error the change can make), two where the legacy record says the field is flat and the " +
	"change would stop calling it a progression, and two that carry no legacy record at all. Within " +
	"each group the artworks are taken first by sorted image path, so none was chosen for how it " +
	"looks; the anchor is removed from the later groups so no artwork is drawn twice. The source file " +
	"that produced the seven, the per-artwork legacy record, and the parameter under consideration " +
	"are named in the round's own directory and deliberately not here: this round is the primary judge " +
	"answering about an artwork, and nothing that could tell them what to answer travels with the items."

export async function build(): Promise<{ fixture: OracleValidationFixture; selected: readonly Selected[]; substitutions: readonly string[] }> {
	const flipSets = await readFlipSets()
	const primary = flipSets.get("monotone-only")
	const backfill = flipSets.get("best-agreement")
	if (primary === undefined || backfill === undefined) throw new Error("the report is missing a flip set this round selects from")

	const { selected, substitutions } = select(primary, backfill)

	const parsed = JSON.parse(await readFile(EVAL_SET_PATH, "utf8")) as { entries: readonly EvalSetEntry[] }
	const evalSet = new Map(parsed.entries.map((entry) => [entry.image.imagePath, entry]))

	const items: OracleValidationItem[] = []
	for (const pick of selected) items.push(await buildItem(pick.imagePath, evalSet))
	// Sorted by content hash so the *file* order is category-independent; the serve order is
	// shuffled separately, from a fixed seed.
	items.sort((a, b) => (a.sha256 < b.sha256 ? -1 : a.sha256 > b.sha256 ? 1 : 0))

	const random = mulberry32(SEED)
	const serveOrder = [...items.map((item) => item.itemId)]
	for (let index = serveOrder.length - 1; index > 0; index--) {
		const swap = Math.floor(random() * (index + 1))
		;[serveOrder[index], serveOrder[swap]] = [serveOrder[swap], serveOrder[index]]
	}

	const fixture: OracleValidationFixture = {
		fixtureVersion: FIXTURE_VERSION,
		batchId: BATCH_ID,
		purpose: "oracle-validation",
		labelSchemaVersion: LABEL_SCHEMA_VERSION,
		seed: SEED,
		generatedBy: BUILDER_REL,
		builtFrom: [EVAL_SET_REL, BUILDER_REL, ROUND_REL],
		selection: {
			rule: SELECTION_RULE,
			counts: {
				anchor: selected.filter((pick) => pick.category === "anchor").length,
				legacy_progression_group: selected.filter((pick) => pick.category === "legacy-ramp-regression").length,
				legacy_flat_group: selected.filter((pick) => pick.category === "legacy-flat-fix").length,
				no_legacy_record_group: selected.filter((pick) => pick.category === "unlabelled").length,
				backfilled: selected.filter((pick) => pick.backfilled).length,
				selected: selected.length,
			},
		},
		questions: [FIELD_GRADIENT_QUESTION],
		items,
		serveOrder,
	}
	validateFixture(fixture)
	return { fixture, selected, substitutions }
}

async function main(): Promise<void> {
	const { fixture, selected, substitutions } = await build()
	await writeFile(FIXTURE_PATH, serializeFixture(fixture))
	process.stdout.write(`${fixture.batchId}: ${fixture.items.length} items, ${fixture.questions.length} question\n`)
	const byId = new Map(fixture.items.map((item) => [item.imagePath, item]))
	for (const pick of selected) {
		const item = byId.get(pick.imagePath)!
		process.stdout.write(`  ${pick.category.padEnd(22)} ${item.itemId}  ${item.stratum.padEnd(18)} ${pick.imagePath}\n`)
	}
	for (const note of substitutions) process.stdout.write(`  SUBSTITUTION ${note}\n`)
	if (substitutions.length === 0) process.stdout.write("  no substitutions: every category was full in the primary set\n")
	process.stdout.write(`wrote ${FIXTURE_PATH}\n`)
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
	await main()
}
