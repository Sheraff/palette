/**
 * The toolbox adjudication round — `toolbox-adjudication-1`.
 *
 * **Why this round exists.** Two reviews of the Phase 0 toolbox landed on 2026-08-04:
 * `reviews/toolbox-review/gap-scan.md` (24 tiered tools that were never built) and
 * `reviews/toolbox-review/bias-audit.md` (10 mechanisms by which the toolbox bends Phase 1's search,
 * each with a mitigation). The orchestrator triaged them into a build list and a drop/defer list, and
 * the reviewer asked to adjudicate the proposals **point by point** instead of accepting the triage
 * wholesale. Their standing rule is that anything needing their eyes lives in the review server, so
 * the triage becomes a round rather than a document.
 *
 * **One item per distinct proposal.** 42 of them, after merging the three sources against each other
 * (the triage duplicates the gap scan's items, so the triage's position is carried as the
 * recommendation on each item rather than as items of its own), folding two blocking prerequisites
 * into the items they block, and excluding what is already built or already ruled out — the
 * auto-adjudication consumer (being built), the exact-expected-palette generator (rejected as posed),
 * file-format forensics (refuted by measurement), and superpixels (already in the tree, so the live
 * proposal is the *withholding*, which is item TB-17).
 *
 * **Plain language is a hard requirement of this round, not a style preference.** The reviewer's
 * rule: every item is described in 2–3 sentences with zero project jargon and every term defined,
 * because an adjudication answered on a term the answerer had to guess at is not an adjudication.
 * The prose lives in `reviews/toolbox-review/adjudication-items.json`, which is this file's input and
 * the round's `builtFrom`.
 *
 * **How it fits the `oracle-validation` mode.** These are text items with a closed four-answer
 * vocabulary, which is exactly what that mode is: a question, a fixed answer list, an opaque token.
 * Two consequences worth stating plainly rather than hiding:
 *
 *  - **Every item carries a carrier image, and it is not an artwork.** `pushOracleValidation`
 *    decodes and hashes an image for every item — the mode has no imageless shape. Pointing 42 text
 *    items at a real album cover would write 42 `oracle-label` rows claiming to be about an artwork
 *    they are not about, which is a lie in the warehouse to save a file. So the round ships its own
 *    carrier panel ({@link TOOLBOX_ADJUDICATION_CARRIER_PATH}), a flat neutral rectangle that the page
 *    never renders. The records then say what is true: these answers are about a round, not a cover.
 *  - **`discuss` is §4's escape answer.** `REVIEW_UI.md` §4 requires a forced choice to have
 *    somewhere to put "I can't tell", and requires its share to be reported as a result rather than
 *    subtracted. Here the undecidable answer and the "let's talk about this one" answer are the same
 *    act, so `discuss` is that escape and its share is a first-class result of the round.
 *
 * **The words travel with the answers, and there is no second copy of them.** Every string the
 * reviewer reads is in the fixture — `question` is the title, `preamble` the description, `framing`
 * the four facts, `instruction` the standing criterion — and the page draws each of them verbatim.
 * An earlier draft shipped a side-car carrying the same prose split into fields for layout, which is
 * the endorsement round's pattern; it is dropped here because the page is built on `round-kit.js`,
 * whose standing rule is that a page fetches nothing of its own, and because the four facts laid out
 * one per line need no splitting to be read.
 *
 * Regenerate the committed fixture and the carrier panel:
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *     research/v3/src/review-server/toolbox-adjudication.ts --write
 * Push it to a running server:
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *     research/v3/src/review-server/toolbox-adjudication.ts --push http://127.0.0.1:3010
 */
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import sharp from "sharp"
import {
	PREMISE_DISAMBIGUATION_FIXTURE_VERSION,
	serializeFixture,
	validateFixture,
	type OracleQuestion,
	type OracleValidationFixture,
	type OracleValidationItem,
} from "./oracle-validation.ts"

/* ------------------------------------------------------------------------------------------- */
/* Identity                                                                                      */
/* ------------------------------------------------------------------------------------------- */

export const TOOLBOX_ADJUDICATION_BATCH_ID = "toolbox-adjudication-1"

/**
 * The marker that says "this round's items are written proposals, not artworks".
 *
 * A `labelSchemaVersion` for the same reason the free-text and endorsement-recheck rounds have one:
 * it is the column every consumer of an `oracle-label` reads before comparing anything, and it is
 * what `batchReviewPaths()` keys the page off. These answers are rulings on what to build; they are
 * not comparable with any VLM row or any other round's tokens.
 */
export const TOOLBOX_ADJUDICATION_LABEL_SCHEMA_VERSION = "toolbox-adjudication.v1"

/** Where the committed fixture lives. */
export const TOOLBOX_ADJUDICATION_FIXTURE_PATH = fileURLToPath(
	new URL("../../data/oracle-validation/toolbox-adjudication-1.json", import.meta.url),
)

/**
 * The carrier panel every item points at.
 *
 * The `oracle-validation` push path decodes and hashes an image per item and there is no imageless
 * shape, so a text round needs *an* image. This one is the round's own: a flat neutral rectangle,
 * never rendered by the page, so no `oracle-label` row claims to be about an artwork it is not about.
 */
export const TOOLBOX_ADJUDICATION_CARRIER_PATH = fileURLToPath(
	new URL("../../data/oracle-validation/toolbox-adjudication-carrier.png", import.meta.url),
)

/** Repo-root-relative, which is the form the fixture stores and `itemImagePath` joins. */
export const TOOLBOX_ADJUDICATION_CARRIER_REF =
	"research/v3/data/oracle-validation/toolbox-adjudication-carrier.png"

/** The image id the records carry. Names the round, because that is what these answers are about. */
export const TOOLBOX_ADJUDICATION_CARRIER_IMAGE_ID = "toolbox-adjudication-carrier"

/** Not a corpus. Says so, so nothing joins these rows to artwork strata by accident. */
export const TOOLBOX_ADJUDICATION_COLLECTION = "review-round-assets"

const ITEMS_PATH = fileURLToPath(new URL("../../reviews/toolbox-review/adjudication-items.json", import.meta.url))

const ITEMS_REF = "research/v3/reviews/toolbox-review/adjudication-items.json"
const GAP_SCAN_REF = "research/v3/reviews/toolbox-review/gap-scan.md"
const BIAS_AUDIT_REF = "research/v3/reviews/toolbox-review/bias-audit.md"

/**
 * Seed for the fixture. Fixed so the committed file is reproducible.
 * [UNCALIBRATED] — the build date, chosen here. Nothing in this round is shuffled: the order is the
 * order the items are written in, which groups related proposals together on purpose, so the seed is
 * recorded for shape rather than used.
 */
export const TOOLBOX_ADJUDICATION_SEED = 20260804

/**
 * The carrier panel's pixels.
 * [UNCALIBRATED] — any decodable image works; this size and colour were chosen here to be obviously
 * not an album cover if it is ever looked at directly.
 */
const CARRIER_WIDTH = 320
const CARRIER_HEIGHT = 180
const CARRIER_RGB = { r: 24, g: 24, b: 27 } as const

/* ------------------------------------------------------------------------------------------- */
/* The question                                                                                  */
/* ------------------------------------------------------------------------------------------- */

/**
 * What the answers do, stated so the stakes are not hidden.
 *
 * Timing is most of the cost on this list. Several items are cheap only while nobody has proposed
 * anything — changing a gate or a metric before proposals exist is housekeeping, and doing it
 * afterwards looks like moving the goalposts for or against a specific proposal. That asymmetry is
 * the reviewer's to weigh, so it is said rather than assumed.
 */
export const TOOLBOX_FRAMING_NOTE =
	"Build-now items are done before Phase 1 opens. Several of them are cheap ONLY before proposals " +
	"exist — a rule changed afterwards cannot be told apart from a rule changed to suit a result — so " +
	"deferring one of those is closer to dropping it than the word suggests. Nothing here is a vote " +
	"about any other item."

/**
 * The answering criterion, on screen for every item.
 *
 * `REVIEW_UI.md` §4, added 2026-08-04: "A round's framing text states the answering CRITERION, not
 * just the question." Two rounds that day turned out to have been answered under a criterion the
 * reviewer picked privately and disclosed afterwards, which is the more expensive of the two lessons.
 * So this says which reading is wanted, in the round's own words, where it will be read while
 * answering.
 */
export const TOOLBOX_INSTRUCTION =
	"Answer about THIS item on its own — not about the list, and not about whether the budget adds up. " +
	"Build now means it happens before Phase 1's proposals are written. Defer means it is worth doing " +
	"but later, once Phase 1 or Phase 2 is running. Drop means it does not get built at all. Discuss " +
	"means you want to talk about it before it is ruled either way, including when the description " +
	"does not give you enough to decide. My recommendation is on screen so you can overrule it; it is " +
	"not a default, and disagreeing with it costs nothing. " +
	TOOLBOX_FRAMING_NOTE

/**
 * The four answers.
 *
 * `discuss` is `REVIEW_UI.md` §4's escape: the answer for an item that cannot be ruled from what is
 * on screen. Its share is reported as a result of the round rather than subtracted from it. It binds
 * `4`; no answer binds `u`, so undo keeps both of its keys.
 */
export const TOOLBOX_ANSWERS = [
	{
		key: "build_now",
		label: "build now",
		gloss: "Worth doing before Phase 1's proposals are written.",
		hotkey: "1",
	},
	{
		key: "defer",
		label: "defer",
		gloss: "Worth doing, but during Phase 1 or Phase 2 rather than before them.",
		hotkey: "2",
	},
	{
		key: "drop",
		label: "drop",
		gloss: "Not worth building. It comes off the list rather than moving down it.",
		hotkey: "3",
	},
	{
		key: "discuss",
		label: "discuss",
		gloss:
			"You want to talk about this one before it is ruled — including when the description does " +
			"not give you enough to decide. Not a way of skipping a hard one: this answer's share is " +
			"reported as a result of the round.",
		hotkey: "4",
	},
] as const

/* ------------------------------------------------------------------------------------------- */
/* Reading the items                                                                             */
/* ------------------------------------------------------------------------------------------- */

/** One proposal, as written in the curated item list. */
export type AdjudicationItem = Readonly<{
	id: string
	title: string
	/** Where the proposal comes from, and its tier there. Becomes the item's stratum root. */
	source: string
	/** 2–3 sentences, zero jargon. The reviewer's rule. */
	plain: string
	/** Which Phase 1 or Phase 2 activity it serves. */
	serves: string
	/** Hours / a day / days, in words. */
	cost: string
	/** One of the four answer keys. */
	recommendation: string
	/** One line. */
	reason: string
}>

type ItemFile = Readonly<{ batch: string; items: readonly AdjudicationItem[] }>

const ANSWER_KEYS = new Set(TOOLBOX_ANSWERS.map((answer) => answer.key))

export async function readAdjudicationItems(): Promise<readonly AdjudicationItem[]> {
	const parsed = JSON.parse(await readFile(ITEMS_PATH, "utf8")) as ItemFile
	if (parsed.batch !== TOOLBOX_ADJUDICATION_BATCH_ID) {
		throw new Error(`${ITEMS_REF} says batch ${parsed.batch}, this builder builds ${TOOLBOX_ADJUDICATION_BATCH_ID}`)
	}
	// The item list writes recommendations the way the round says them out loud — `build-now`. The
	// warehouse's vocabulary keys are identifiers, so the hyphen becomes an underscore here rather
	// than in 42 hand-written entries where one of them would eventually be typed the other way.
	const items = parsed.items.map((item) => ({ ...item, recommendation: item.recommendation.replace(/-/gu, "_") }))
	for (const item of items) {
		// Every field is load-bearing on screen, and an empty one is a blank block the reviewer is
		// asked to rule on. Checked here rather than trusted, because the list is hand-written.
		for (const field of ["id", "title", "source", "plain", "serves", "cost", "recommendation", "reason"] as const) {
			if (typeof item[field] !== "string" || item[field].trim().length === 0) {
				throw new Error(`item ${item.id ?? "(unnamed)"} has no ${field}`)
			}
		}
		if (!ANSWER_KEYS.has(item.recommendation)) {
			throw new Error(`item ${item.id} recommends ${item.recommendation}, which is not one of ${[...ANSWER_KEYS].join(" | ")}`)
		}
	}
	return items
}

/* ------------------------------------------------------------------------------------------- */
/* Building                                                                                      */
/* ------------------------------------------------------------------------------------------- */

export const questionKeyFor = (id: string): string => `toolbox_adjudication_${id.toLowerCase().replace(/-/gu, "_")}`

/**
 * The one string that carries what an item serves, what it costs and my call into the fixture.
 *
 * Composed in one place, and printed by the page verbatim, so the words the reviewer reads and the
 * words their answers are recorded under are the same characters.
 */
export function framingFor(item: AdjudicationItem): string {
	const label = TOOLBOX_ANSWERS.find((answer) => answer.key === item.recommendation)!.label
	// One fact per line, and the page prints this string verbatim into a pre-wrap panel — so what is
	// laid out and what is recorded are the same characters, with no splitting, no side-car and no way
	// for the two to drift. The standing caveat about timing lives in the instruction instead: it is
	// identical on every item, and a string served here that nothing draws would be words recorded but
	// never read.
	return (
		`What it serves — ${item.serves}\n` +
		`What it costs — ${item.cost}\n` +
		`My call — ${label}: ${item.reason}\n` +
		`From — ${item.source}`
	)
}

/**
 * Every string the reviewer will read is present, non-empty and its own.
 *
 * A blank question field renders as a blank block on a page whose entire content is text: there is no
 * artwork to carry the item, so an empty `preamble` is an item with nothing in it and a ruling given
 * on nothing. Checked at build time, when it is a build failure rather than a wasted round.
 */
export function assertEveryItemReadable(fixture: OracleValidationFixture): void {
	const seen = new Set<string>()
	for (const question of fixture.questions) {
		for (const [field, value] of [
			["question", question.question],
			["instruction", question.instruction],
			["preamble", question.preamble ?? ""],
			["framing", question.framing ?? ""],
		] as const) {
			if (value.trim().length === 0) throw new Error(`question ${question.key} has an empty ${field}`)
		}
		// Two proposals with the same description are one proposal written twice, and the reviewer would
		// be ruling twice on the same thing without being told.
		if (seen.has(question.preamble ?? "")) throw new Error(`two items share a description: ${question.key}`)
		seen.add(question.preamble ?? "")
	}
}

/** The carrier panel's bytes. Deterministic, so the committed file and its hash are reproducible. */
export async function carrierBytes(): Promise<Buffer> {
	return await sharp({
		create: { width: CARRIER_WIDTH, height: CARRIER_HEIGHT, channels: 3, background: CARRIER_RGB },
	})
		.png({ compressionLevel: 9 })
		.toBuffer()
}

export async function buildToolboxAdjudicationFixture(carrierSha256: string): Promise<OracleValidationFixture> {
	const items = await readAdjudicationItems()
	const questions: OracleQuestion[] = []
	const fixtureItems: OracleValidationItem[] = []

	for (const item of items) {
		const questionKey = questionKeyFor(item.id)
		questions.push({
			key: questionKey,
			kind: "enum",
			question: `${item.id} — ${item.title}`,
			instruction: TOOLBOX_INSTRUCTION,
			preamble: item.plain,
			framing: framingFor(item),
			answers: TOOLBOX_ANSWERS.map((answer) => ({ ...answer })),
		})
		fixtureItems.push({
			itemId: `toolbox-${item.id.toLowerCase()}`,
			questionKey,
			imagePath: TOOLBOX_ADJUDICATION_CARRIER_REF,
			sha256: carrierSha256,
			// One image asked 42 different questions. The server keys an answer by (question, image),
			// so the pairs stay unique and each item is its own row.
			imageId: TOOLBOX_ADJUDICATION_CARRIER_IMAGE_ID,
			artworkId: null,
			collection: TOOLBOX_ADJUDICATION_COLLECTION,
			rendition: {
				source: ITEMS_REF,
				sourceEntryId: item.id,
				longEdgePx: Math.max(CARRIER_WIDTH, CARRIER_HEIGHT),
				width: CARRIER_WIDTH,
				height: CARRIER_HEIGHT,
			},
			// Which review the proposal came from and at what tier — the population it was drawn from,
			// which is what a stratum is for. Reported per-stratum when the round is read back.
			stratum: item.source,
		})
	}

	const byRecommendation: Record<string, number> = {}
	for (const item of items) byRecommendation[item.recommendation] = (byRecommendation[item.recommendation] ?? 0) + 1

	const fixture: OracleValidationFixture = {
		fixtureVersion: PREMISE_DISAMBIGUATION_FIXTURE_VERSION,
		batchId: TOOLBOX_ADJUDICATION_BATCH_ID,
		purpose: "oracle-validation",
		labelSchemaVersion: TOOLBOX_ADJUDICATION_LABEL_SCHEMA_VERSION,
		seed: TOOLBOX_ADJUDICATION_SEED,
		generatedBy: "research/v3/src/review-server/toolbox-adjudication.ts",
		builtFrom: [GAP_SCAN_REF, BIAS_AUDIT_REF, ITEMS_REF],
		selection: {
			rule:
				"One item per distinct proposal across the two toolbox reviews of 2026-08-04, after merging " +
				"the orchestrator's triage into them as the recommendation on each item, folding two blocking " +
				"prerequisites into the items they block, and excluding what is already built or already " +
				"ruled out: the auto-adjudication consumer (being built), the exact-expected-palette " +
				"generator (rejected as posed), file-format forensics (refuted by measurement) and " +
				"superpixels (already in the tree — the live proposal is TB-17, withholding them).",
			counts: {
				items: fixtureItems.length,
				questions: questions.length,
				gap_scan: items.filter((item) => item.source.startsWith("gap-scan")).length,
				bias_audit: items.filter((item) => item.source.startsWith("bias-audit")).length,
				...byRecommendation,
			},
		},
		questions,
		items: fixtureItems,
		serveOrder: fixtureItems.map((item) => item.itemId),
	}

	validateFixture(fixture)
	assertEveryItemReadable(fixture)
	return fixture
}

/** Build against the carrier bytes without writing anything — what the tests and `--push` use. */
export async function buildToolboxAdjudicationRound(): Promise<{
	fixture: OracleValidationFixture
	carrier: Buffer
}> {
	const carrier = await carrierBytes()
	const carrierSha256 = createHash("sha256").update(carrier).digest("hex")
	return { fixture: await buildToolboxAdjudicationFixture(carrierSha256), carrier }
}

/* ------------------------------------------------------------------------------------------- */
/* Writing and pushing                                                                           */
/* ------------------------------------------------------------------------------------------- */

export async function writeToolboxAdjudicationRound(): Promise<{ items: number }> {
	const { fixture, carrier } = await buildToolboxAdjudicationRound()
	await writeFile(TOOLBOX_ADJUDICATION_CARRIER_PATH, carrier)
	await writeFile(TOOLBOX_ADJUDICATION_FIXTURE_PATH, serializeFixture(fixture))
	return { items: fixture.items.length }
}

/**
 * Push over HTTP, the way `endorsement-recheck-1` was pushed. Idempotent only by batch id.
 *
 * **It writes the carrier panel first, and that is not a convenience.** `.gitignore` excludes `*.png`
 * repo-wide, so the panel is not a committed file — it is a build output, reproduced byte-for-byte
 * from {@link carrierBytes} whenever it is needed. The push path re-hashes the file on disk and
 * refuses a fixture whose `sha256` disagrees, so a clean checkout that pushed without writing would
 * fail on the first item with a missing-file error and send the next reader hunting for an asset
 * that was never supposed to be stored. Writing it here makes the round rebuildable from source
 * alone, which is the property the ignore rule would otherwise cost.
 */
export async function pushToolboxAdjudicationRound(base: string): Promise<unknown> {
	const { fixture, carrier } = await buildToolboxAdjudicationRound()
	await writeFile(TOOLBOX_ADJUDICATION_CARRIER_PATH, carrier)
	const response = await fetch(`${base}/api/oracle-validation`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		// No decision-record ids: the two reviews this round adjudicates are documents, and they are
		// named in `builtFrom` where a document belongs.
		body: JSON.stringify({ fixture, fundedBy: [] }),
	})
	const body = await response.json().catch(() => ({}))
	if (!response.ok) throw new Error(`push failed: ${response.status} ${JSON.stringify(body)}`)
	return body
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: { write: { type: "boolean", default: false }, push: { type: "string" } },
		strict: true,
	})
	if (values.write) {
		const written = await writeToolboxAdjudicationRound()
		process.stdout.write(
			`wrote ${TOOLBOX_ADJUDICATION_CARRIER_PATH}\nwrote ${TOOLBOX_ADJUDICATION_FIXTURE_PATH}\n` +
				`${written.items} items\n`,
		)
	}
	if (values.push !== undefined) {
		const result = await pushToolboxAdjudicationRound(values.push)
		process.stdout.write(`pushed ${TOOLBOX_ADJUDICATION_BATCH_ID}: ${JSON.stringify(result)}\n`)
		return
	}
	if (!values.write) {
		const { fixture } = await buildToolboxAdjudicationRound()
		const items = await readAdjudicationItems()
		const label = (key: string) => TOOLBOX_ANSWERS.find((answer) => answer.key === key)!.label
		process.stdout.write(
			`${fixture.batchId}: ${fixture.items.length} items, ${fixture.questions.length} questions\n` +
				items.map((item) => `  ${item.id} ${label(item.recommendation).padEnd(10)} ${item.title}\n`).join(""),
		)
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
