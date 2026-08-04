/**
 * The round-page payload contract — what a review page is allowed to be told.
 *
 * **Why this file exists.** Two review pages shipped broken in two days. `/freetext` had a key
 * handler that could not fire (`normalizeKey(event)` instead of `normalizeKey(event.key)`), and the
 * endorsement-recheck page shipped with no working input surface. Neither was a hard problem; both
 * were the same problem, which is that every page in `review-ui/` reimplements payload fetch,
 * navigation, key handling, hints, autosave, undo, resume and release from scratch, so every page
 * gets its own fresh chance to get one of them wrong — and a page that renders is indistinguishable
 * from a page that works until the reviewer sits down in front of it.
 *
 * `round-kit.js` is the shared shell. This file is its server-side half: the shape of the payload
 * the shell consumes, and — the part that carries real weight — **an explicit allowlist of the
 * fields a round page may be served.**
 *
 * **The leak-guard is by construction, not by review.** The oracle-validation payload is already
 * hand-guarded by an exact key-set assertion in its tests, because that batch exists to break a tie
 * between the oracle and the accepted palette and both of their answers have to stay server-side. A
 * hand-maintained assertion works exactly until someone adds a round and does not know to write one.
 * `projectItem` inverts that: a field that is not on the list does not reach the browser, whatever
 * the round put in its fixture. Adding a leak takes a deliberate edit to the allowlist below, which
 * is a line a reviewer will see in a diff, rather than an omission nobody can see anywhere.
 *
 * What must never reach a page, and why each one is a real leak and not a hypothetical:
 *  - `variantId` / `fingerprint` — the algorithm version behind a palette. The grade is supposed to
 *    be about the palette.
 *  - the oracle's own answer, per variant, and the published gradient flag — the two sides of the
 *    tie the reviewer is being asked to break.
 *  - `sha256` / `imagePath` / the real `itemId` — the join key to both of the above, and to the
 *    fixture's own selection counts. An id is a lookup away from everything it identifies.
 *  - `stratum`, selection counts, contradiction buckets — they say what the round expected to find,
 *    which is a prior the reviewer should not be handed.
 */

/** A key the browser uses to name one item. Opaque and random per batch — never the fixture's id. */
export type AnswerToken = string

/**
 * Every field a round page may see on ONE item.
 *
 * Deliberately short. A field earns its place here by being something the reviewer must SEE or the
 * page must USE to draw itself — not by being convenient for a page that could ask for it another
 * way. `width`/`height` are here so the frame can hold its aspect ratio before the bytes land, which
 * is the difference between a page that settles and a page that jumps under the reviewer's cursor.
 */
export const ITEM_FIELD_ALLOWLIST = [
	/** The opaque handle the page answers with. The server resolves it to the real item. */
	"token",
	/** Which question this item asks — the page groups and labels by it. */
	"questionKey",
	/** `/media/<batch>/<token>`. Never a path on disk. */
	"media",
	/** From the file header, so the frame does not jump when the bytes arrive. */
	"width",
	"height",
	/** The reviewer's own standing answer, so the page can resume and so undo can reload it. */
	"answer",
	/** How many times they have answered it. Drives the "answered" label, nothing else. */
	"revision",
	/**
	 * The reviewer's OWN optional remark on their answer, served back so a reload does not lose it.
	 * Their words, like `answer` — it leaks nothing, because it came from them.
	 */
	"note",
	/** By-artwork rounds only: the reviewer's OWN earlier answers and the rule they break. */
	"reconciliation",
	/** Free-text rounds only: the reviewer's OWN earlier answer from another round, as context. */
	"priorAnswer",
] as const

export type ItemField = (typeof ITEM_FIELD_ALLOWLIST)[number]

/**
 * Fields a round page may see on the QUESTION.
 *
 * The wording a reviewer read must travel with their answers, so all of it is served — but it is
 * served from the FIXTURE, which is the copy the answers were recorded under. A page that carried
 * its own copy of a question would drift from the fixture the first time someone fixed a typo, and
 * an answer only means something against the exact words it was answered under.
 */
export const QUESTION_FIELD_ALLOWLIST = [
	"key",
	"kind",
	"question",
	"instruction",
	"preamble",
	"framing",
	"contextLabel",
	"contextNote",
	"answers",
	"itemCount",
] as const

export type QuestionField = (typeof QUESTION_FIELD_ALLOWLIST)[number]

/** Fields a round page may see about the BATCH itself. */
export const BATCH_FIELD_ALLOWLIST = ["batchId", "purpose", "pushedAt", "released", "releasedAt", "serveMode", "questions", "items"] as const

export type BatchField = (typeof BATCH_FIELD_ALLOWLIST)[number]

/**
 * Fields that have leaked, or would leak, and are named so the guard can say WHICH one it caught.
 *
 * A test that says "an unexpected field appeared" sends the next reader to read the whole payload
 * builder. One that says "sha256 is the join key to the oracle's own answer" sends them to the
 * decision. Every entry here is a field that exists on a fixture item today.
 */
export const KNOWN_LEAK_FIELDS: Readonly<Record<string, string>> = {
	sha256: "the content hash is the join key to the oracle's rows and to the published palette",
	imagePath: "a path on disk identifies the artwork, and the corpus layout encodes its stratum",
	itemId: "the fixture's own id joins to the selection counts and to the contradiction buckets",
	artworkId: "groups renditions, and joins to every other round's answer for the same artwork",
	stratum: "says which population the item was drawn from — a prior about what to expect",
	collection: "narrows the artwork to a corpus, which narrows what it is likely to be",
	rendition: "carries the source entry id, which is a join key to the eval set",
	variantId: "the algorithm version behind a palette; the grade is meant to be about the palette",
	fingerprint: "code fingerprints identify the arm, and the verdict is not supposed to be about the arm",
	oracle: "the model's own answer — one of the two sides of the tie the reviewer is breaking",
	groundTruth: "the answer the round exists to elicit",
	flagGradient: "the published gradient boolean — the other side of that same tie",
	contradicted: "which variant the flag disagrees with, which is the disagreement itself",
	selection: "the round's own selection counts say what it expected to find",
}

export type ProjectionProblem = Readonly<{ field: string; why: string }>

/**
 * Keep only the allowlisted fields, and say what was dropped.
 *
 * Absent keys are OMITTED rather than nulled, because the oracle round's guard is an exact key-set
 * assertion and a field that appears on every round — carrying `null` for the four that have no use
 * for it — would widen that allowlist permanently to buy nothing. "This round has no reconciliation
 * context" and "this item's reconciliation context is empty" are different statements.
 */
export function projectItem(item: Readonly<Record<string, unknown>>): {
	projected: Record<string, unknown>
	dropped: readonly ProjectionProblem[]
} {
	const projected: Record<string, unknown> = {}
	const dropped: ProjectionProblem[] = []
	for (const field of ITEM_FIELD_ALLOWLIST) {
		if (item[field] !== undefined) projected[field] = item[field]
	}
	for (const field of Object.keys(item)) {
		if ((ITEM_FIELD_ALLOWLIST as readonly string[]).includes(field)) continue
		dropped.push({ field, why: KNOWN_LEAK_FIELDS[field] ?? "not on the item allowlist" })
	}
	return { projected, dropped }
}

/** The same, for a question. */
export function projectQuestion(question: Readonly<Record<string, unknown>>): {
	projected: Record<string, unknown>
	dropped: readonly ProjectionProblem[]
} {
	const projected: Record<string, unknown> = {}
	const dropped: ProjectionProblem[] = []
	for (const field of QUESTION_FIELD_ALLOWLIST) {
		if (question[field] !== undefined) projected[field] = question[field]
	}
	for (const field of Object.keys(question)) {
		if ((QUESTION_FIELD_ALLOWLIST as readonly string[]).includes(field)) continue
		dropped.push({ field, why: KNOWN_LEAK_FIELDS[field] ?? "not on the question allowlist" })
	}
	return { projected, dropped }
}

/**
 * Everything wrong with a payload, as a list rather than a throw.
 *
 * A list, because the caller is a test that wants to report all of them at once, and because a
 * payload with three leaks should not need three runs to find them.
 */
export function auditRoundPayload(payload: Readonly<Record<string, unknown>>): readonly ProjectionProblem[] {
	const problems: ProjectionProblem[] = []
	for (const field of Object.keys(payload)) {
		if ((BATCH_FIELD_ALLOWLIST as readonly string[]).includes(field)) continue
		problems.push({ field: `payload.${field}`, why: KNOWN_LEAK_FIELDS[field] ?? "not on the batch allowlist" })
	}
	const questions = Array.isArray(payload.questions) ? (payload.questions as Record<string, unknown>[]) : []
	for (const question of questions) {
		for (const problem of projectQuestion(question).dropped) {
			problems.push({ field: `questions[${String(question.key)}].${problem.field}`, why: problem.why })
		}
	}
	const items = Array.isArray(payload.items) ? (payload.items as Record<string, unknown>[]) : []
	for (const [index, item] of items.entries()) {
		for (const problem of projectItem(item).dropped) {
			problems.push({ field: `items[${index}].${problem.field}`, why: problem.why })
		}
	}
	return problems
}

/**
 * The house navigation rules, in one place, so a page cannot invent its own.
 *
 * These are not preferences. Each one is a behaviour a shipped page got wrong, or nearly did, and
 * the kit enforces them for every round rather than each page re-deciding:
 *
 *  - `autoAdvanceOnAnswer` — a closed answer moves on by itself (REVIEW_UI.md §6, the five-second
 *    rule). A multi-select cannot, because the reviewer is still choosing; it commits on Enter.
 *  - `textFieldOwnsArrows` — when a text field has focus, the plain arrow keys belong to the CARET.
 *    `/freetext` stole them for navigation, which made a typo unfixable and, once focus became
 *    permanent, made stepping back impossible. Escape leaves the field; then the arrows step.
 *  - `releaseKeyNeverShadowed` — `r` releases the round, and `r` is also a letter a reviewer types.
 *    Release must never fire from inside a text field, and must never be bound to a key some
 *    question also binds as an answer.
 */
export const ROUND_NAVIGATION_RULES = [
	"autoAdvanceOnAnswer: a single-token answer advances; a multi-select commits on Enter and then advances",
	"textFieldOwnsArrows: while a text field has focus, Enter saves-and-advances and every other navigation key belongs to the field; Escape leaves it",
	"releaseKeyNeverShadowed: release never fires from inside a text field, and never shares a key with an answer",
	"resumeAtFirstUnanswered: a round opens where the reviewer stopped, not at item 1",
	"visibleFailure: a payload that does not load says so on screen; a page never sits on 'loading…' forever",
	"alwaysRenderedKeymap: the live keys are on screen at all times, never in a tooltip and never implied",
] as const
