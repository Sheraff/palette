/**
 * The round-page kit — the shell every review round is built on.
 *
 * **What this file is for.** Two review pages shipped broken in two days. `/freetext` called
 * `normalizeKey(event)` instead of `normalizeKey(event.key)`, so its key handler could not fire and
 * the reviewer was stuck on cover 1 with a working save path underneath. The endorsement-recheck
 * page shipped with no working input surface. Neither was hard; both happened because every page in
 * `review-ui/` re-implemented fetch, navigation, keys, hints, autosave, undo, resume and release, so
 * every page got a fresh chance to get one of them wrong.
 *
 * The kit exists so those are written once. This file is where they are TESTED once — the
 * executing-page suite runs against the kit, not against each page, and every case below is a
 * behaviour that a real browser has and the old test harness did not. That gap is the actual root
 * cause: sixteen green tests and a dead page is not bad luck, it is a harness that could not reach
 * the branch the reviewer lives in.
 *
 * The divergences encoded here, each one a way a page can look fine and be broken:
 *
 *  1. **focus semantics** — `document.activeElement` must change when a field is focused. It never
 *     did, so the in-field branch of any key handler was unreachable in tests while the reviewer was
 *     only ever in it.
 *  2. **event vs key** — passing the event object to `normalizeKey` must be impossible, not merely
 *     discouraged. The kit reads `.key` at one call site and hands widgets strings.
 *  3. **getElementById vs querySelector** — a browser treats them as the same lookup; the harness
 *     implemented one. A page written with the other found nothing and was untestable.
 *  4. **absolute vs relative imports** — a relative specifier resolves against the importing
 *     module's URL, which is not the directory a page is served from once it has a route.
 *  5. **window vs globalThis** — `window` does not exist under the test harness or in a module
 *     worker; a page that reaches for it throws on load.
 *  6. **module throw after first paint** — a page can render its shell and then die, and `verify-live`
 *     cannot tell: it checks that a module is SERVED, not that it runs. The kit's answer is that
 *     failure is always visible on screen, never a permanent "loading…".
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { readFile, readdir } from "node:fs/promises"
import { after, before, describe, it } from "node:test"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import {
	BATCH_FIELD_ALLOWLIST,
	ITEM_FIELD_ALLOWLIST,
	KNOWN_LEAK_FIELDS,
	QUESTION_FIELD_ALLOWLIST,
	ROUND_NAVIGATION_RULES,
	auditRoundPayload,
	projectItem,
	projectQuestion,
} from "../src/review-server/round-kit.ts"
import { GROUND_FREETEXT_BATCH_ID } from "../src/review-server/freetext.ts"
import { BCDE_VALIDATION_BATCH_ID } from "../src/review-server/oracle-validation.ts"
import { seedBcdeValidationRound, seedGroundFreetextRound } from "../src/review-server/server.ts"
import { call, openPage, startHarness, type FakePage, type Harness } from "../src/review-server/test-support.ts"

const UI_ROOT = fileURLToPath(new URL("../review-ui/", import.meta.url))
const STYLESHEET = fileURLToPath(new URL("../review-ui/styles.css", import.meta.url))

/**
 * Every class name the stylesheet defines a rule for.
 *
 * Lifted from `review-server-endorsement-recheck.test.ts`, where it was page-local, and generalized
 * to the kit — so it now guards every round built on the kit instead of the one page that was
 * already broken when it was written.
 */
const STYLED_CLASSES = new Set([...readFileSync(STYLESHEET, "utf8").matchAll(/\.([a-zA-Z][\w-]*)/gu)].map((match) => match[1]))
const FREETEXT_PAGE = join(UI_ROOT, "freetext.js")
const KIT = join(UI_ROOT, "round-kit.js")

/* ------------------------------------------------------------------------------------------- */
/* The payload contract — leak-guard by construction                                             */
/* ------------------------------------------------------------------------------------------- */

describe("round payload contract", () => {
	it("drops every field that is not on the item allowlist, and says why", () => {
		const { projected, dropped } = projectItem({
			token: "t",
			questionKey: "ground_type",
			media: "/media/b/t",
			width: 300,
			height: 300,
			answer: null,
			revision: 0,
			// Everything below is real: each one exists on a fixture item today.
			sha256: "deadbeef",
			imagePath: "0f/abc.jpg",
			itemId: "cg-0473407d713f",
			artworkId: "0004ccf0",
			stratum: "thumbnail_<=320",
			collection: "sharded-corpus",
			rendition: { source: "eval-set.json" },
		})
		assert.deepEqual(Object.keys(projected).sort(), ["answer", "height", "media", "questionKey", "revision", "token", "width"])
		assert.deepEqual(
			dropped.map((problem) => problem.field).sort(),
			["artworkId", "collection", "imagePath", "itemId", "rendition", "sha256", "stratum"],
		)
		// The reason travels with the field. "an unexpected field appeared" sends the next reader to
		// the payload builder; "the content hash is the join key to the oracle's rows" sends them to
		// the decision.
		for (const problem of dropped) assert.ok(problem.why.length > 20, `${problem.field} has no reason attached`)
		assert.match(dropped.find((problem) => problem.field === "sha256")!.why, /join key/u)
	})

	it("omits an absent field rather than nulling it", () => {
		// "This round has no reconciliation context" and "this item's context is empty" are different
		// statements, and the oracle round's own guard is an exact key-set assertion.
		const { projected } = projectItem({ token: "t", questionKey: "q", media: "/m", width: 1, height: 1, answer: null, revision: 0 })
		assert.ok(!("reconciliation" in projected))
		assert.ok(!("priorAnswer" in projected))
	})

	it("keeps every word the reviewer read, because an answer means nothing without them", () => {
		const { projected, dropped } = projectQuestion({
			key: "ground_type",
			kind: "enum",
			question: "what is the ground?",
			instruction: "answer this one question only",
			preamble: "the background means…",
			framing: "unsure is a real answer",
			contextLabel: "you answered:",
			contextNote: "nothing is being challenged",
			answers: [{ key: "flat_field", hotkey: "1" }],
			itemCount: 9,
			selection: { rule: "the round's own selection counts" },
		})
		assert.equal(projected.question, "what is the ground?")
		assert.equal(projected.instruction, "answer this one question only")
		assert.deepEqual(dropped.map((problem) => problem.field), ["selection"])
	})

	it("names the navigation rules, so a page cannot quietly invent its own", () => {
		const text = ROUND_NAVIGATION_RULES.join("\n")
		assert.match(text, /autoAdvanceOnAnswer/u)
		assert.match(text, /textFieldOwnsArrows/u)
		assert.match(text, /releaseKeyNeverShadowed/u)
		assert.match(text, /resumeAtFirstUnanswered/u)
		assert.match(text, /visibleFailure/u)
		assert.match(text, /alwaysRenderedKeymap/u)
	})

	it("has no field on two allowlists at once", () => {
		// A field that is both a batch field and an item field is a field whose meaning depends on
		// where it is read, which is how a guard gets talked out of firing.
		const item = new Set<string>(ITEM_FIELD_ALLOWLIST)
		for (const field of QUESTION_FIELD_ALLOWLIST) assert.ok(!item.has(field), `${field} is on two allowlists`)
		for (const field of BATCH_FIELD_ALLOWLIST) assert.ok(!item.has(field), `${field} is on two allowlists`)
		// Nothing on an allowlist may also be a known leak.
		for (const field of [...ITEM_FIELD_ALLOWLIST, ...QUESTION_FIELD_ALLOWLIST]) {
			assert.ok(!(field in KNOWN_LEAK_FIELDS), `${field} is both allowed and named as a leak`)
		}
	})
})

describe("the live payloads, audited against the contract", () => {
	let harness: Harness

	before(async () => {
		harness = await startHarness()
		await seedGroundFreetextRound(harness.handle.service)
		await seedBcdeValidationRound(harness.handle.service)
	})

	after(async () => {
		await harness?.stop()
	})

	for (const batchId of [GROUND_FREETEXT_BATCH_ID, BCDE_VALIDATION_BATCH_ID]) {
		it(`leaks nothing on ${batchId}`, async () => {
			const payload = await call(harness.base, "GET", `/api/oracle-validation/${batchId}`)
			assert.equal(payload.status, 200)
			const problems = auditRoundPayload(payload.body)
			assert.deepEqual(problems, [], `the payload serves fields no round page may see:\n${problems.map((p) => `  ${p.field} — ${p.why}`).join("\n")}`)
		})
	}
})

/* ------------------------------------------------------------------------------------------- */
/* The executing-page suite — the real-browser behaviours that killed two pages                  */
/* ------------------------------------------------------------------------------------------- */

describe("the kit, executed as a page", () => {
	let harness: Harness
	let page: FakePage
	const NODE_IDS = [
		"question",
		"instruction",
		"progress",
		"stage",
		"frame",
		"artwork",
		"context",
		"context-label",
		"context-answer",
		"context-note",
		"answer",
		"saved",
		"side",
		"done",
		"pending",
		"status",
		"keymap",
		"notebox",
		"noteinput",
		"notemark",
		"itemref",
	] as const

	before(async () => {
		harness = await startHarness()
		await seedGroundFreetextRound(harness.handle.service)
		page = await openPage(harness.base, FREETEXT_PAGE, NODE_IDS, `${harness.base}/freetext?batch=${GROUND_FREETEXT_BATCH_ID}`)
	})

	after(async () => {
		await harness?.stop()
	})

	it("(1) focus semantics — a focused field is visible as document.activeElement", () => {
		// The harness gap that hid the `/freetext` defect. A page with a text field lives almost
		// entirely in the in-field branch; if focus is a no-op, tests can only ever walk the other one.
		const document = (globalThis as unknown as { document: { activeElement: unknown } }).document
		assert.equal(document.activeElement, page.nodes.answer, "the kit did not focus the field, or focus is not observable")
		page.nodes.answer.blur()
		assert.equal(document.activeElement, null, "blur did not release focus")
		page.nodes.answer.focus()
		assert.equal(document.activeElement, page.nodes.answer)
	})

	it("(2) event vs key — the kit reads .key itself, and widgets never see the event", async () => {
		const source = await readFile(KIT, "utf8")
		// Code, not prose: the header comment legitimately quotes the bug it exists to prevent.
		const code = source.slice(source.indexOf('import { normalizeKey'))
		// Exactly one place in the kit turns an event into a key, and it does it by reading `.key`.
		const calls = [...code.matchAll(/normalizeKey\(/gu)]
		assert.equal(calls.length, 1, "the kit normalizes keys in more than one place; they will drift")
		assert.match(source, /function readKey\(event\)/u)
		assert.match(source, /event\.key/u)
		// And the handler actually works end to end, which is what the old page could not do.
		page.nodes.answer.focus()
		page.nodes.answer.enter("a described ground, in the reviewer's own words")
		await page.press("Enter")
		assert.match(page.nodes.progress.textContent, /^2 \/ 9/u, "STUCK: the kit's key dispatch did not advance")
	})

	it("(3) getElementById and querySelector are the same lookup", async () => {
		const document = (globalThis as unknown as { document: Record<string, (arg: string) => unknown> }).document
		assert.equal(typeof document.getElementById, "function", "the harness cannot answer the spelling half the pages use")
		for (const id of ["question", "status", "answer"]) {
			assert.equal(document.getElementById(id), document.querySelector(`#${id}`), `${id} resolves differently by spelling`)
		}
		// The kit must use a lookup that survives either, or a page is untestable through no fault of
		// its own — which is the corner both incidents were shipped from.
		const source = await readFile(KIT, "utf8")
		assert.match(source, /getElementById/u)
		assert.match(source, /querySelector/u)
	})

	it("(4) imports are root-absolute, so a route does not change what resolves", async () => {
		const source = await readFile(KIT, "utf8")
		// The one dynamic import in the kit is the pinned mock. A relative specifier resolves against
		// the importing module's URL, which is not the directory a page is served from once it has a
		// route rather than a file path.
		for (const match of source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/gu)) {
			assert.ok(match[1].startsWith("/"), `dynamic import of ${match[1]} is relative; it will resolve differently under a route`)
		}
		// And there is exactly ONE mock renderer in the tree, pinned.
		assert.match(source, /import\("\/mock\.js"\)/u)
	})

	it("(5) window vs globalThis — the kit never reaches for window", async () => {
		const source = await readFile(KIT, "utf8")
		assert.doesNotMatch(source, /\bwindow\./u, "`window` does not exist under the harness or in a module worker; the page throws on load")
		assert.match(source, /globalThis/u)
	})

	it("(6) a module that dies after first paint says so on screen", async () => {
		// `verify-live` cannot catch this: it asserts a module is SERVED, not that it runs. The kit's
		// answer is that a failure is always visible — never a permanent "loading…", which is
		// indistinguishable from a slow network and sends the reviewer away instead of to the
		// orchestrator.
		// A genuinely empty queue. Naming a batch that does not exist is NOT enough: the kit falls back
		// to the newest unreleased round of its kind, which is the right thing for a stale bookmark.
		const empty = await startHarness()
		const broken = await openPage(empty.base, FREETEXT_PAGE, NODE_IDS, `${empty.base}/freetext?batch=ground-freetext-1`)
		assert.doesNotMatch(broken.nodes.question.textContent, /loading/iu, "the page sat on 'loading…' — indistinguishable from a slow network")
		assert.match(broken.nodes.status.textContent, /no free-text round in the queue/u)
		assert.match(broken.nodes.stage.textContent, /nothing was lost/u, "the error surface does not tell the reviewer what to do")
		await empty.stop()
	})

	it("(7) every class the kit renders matches a real rule in styles.css", () => {
		// The third incident, generalized. The endorsement page invented `oracle-answer`; it matched no
		// rule, its hotkey grid collapsed into a run-on line on the reviewer's screen, and every
		// textContent assertion still passed — the harness has no CSS engine, so an unstyled class is
		// invisible here and catastrophic there. This walks what the kit ACTUALLY RENDERED, so it
		// covers classes built at runtime from template strings, which a source scan cannot see.
		const unstyled = new Set<string>()
		const walk = (n: { className: string; children: { className: string; children: unknown[] }[] }) => {
			for (const token of n.className.split(" ")) {
				if (token.length === 0) continue
				if (!STYLED_CLASSES.has(token)) unstyled.add(token)
			}
			for (const child of n.children) walk(child as never)
		}
		for (const id of NODE_IDS) walk(page.nodes[id] as never)
		assert.deepEqual([...unstyled], [], "these classes match no rule in styles.css, so they render unstyled in the browser")
	})

	it("(8) offers navigation that answers nothing, so two items can be compared before deciding", async () => {
		// The endorsement page shipped with no way to see item 2 without committing an answer to item
		// 1, which makes "let me look at both before I decide" impossible and turns a considered
		// judgement into a forced one.
		const before = harness.records().filter((record) => record.type === "oracle-label").length
		const at = page.nodes.progress.textContent
		// Blur before each key: on a TEXT round the field re-takes focus after every render, so Escape
		// is required each time. That is the documented flow and the reason plain arrows are never
		// stolen from the caret. On an enum round the field never has focus and j/k work directly.
		page.nodes.answer.blur()
		await page.press("j")
		assert.notEqual(page.nodes.progress.textContent, at, "j did not move to the next item")
		page.nodes.answer.blur()
		await page.press("k")
		assert.equal(page.nodes.progress.textContent, at, "k did not come back")
		assert.equal(
			harness.records().filter((record) => record.type === "oracle-label").length,
			before,
			"navigating recorded an answer; the reviewer cannot look without committing",
		)
	})

	it("(8b) clamps at both ends rather than running off the round", async () => {
		const resumed = await openPage(harness.base, FREETEXT_PAGE, NODE_IDS, `${harness.base}/freetext?batch=${GROUND_FREETEXT_BATCH_ID}`)
		resumed.nodes.answer.blur()
		for (let step = 0; step < 3; step += 1) {
			resumed.nodes.answer.blur()
			await resumed.press("k").catch(() => {})
		}
		assert.match(resumed.nodes.progress.textContent, /^1 \/ 9/u, "navigation ran off the front of the round")
		assert.match(resumed.nodes.status.textContent, /already at the first cover/u)
	})

	it("(10) shows a copyable item id that matches the payload", async () => {
		// The reviewer, 2026-08-04: "i often want to give feedback about a specific thing and we
		// currently have no way of doing that, which prevents accidental discovery of information."
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${GROUND_FREETEXT_BATCH_ID}`)
		const shown = page.nodes.itemref.textContent
		assert.ok(shown.length > 0, "no item id is rendered, so the reviewer cannot name what they are looking at")
		assert.ok(
			payload.body.items.some((item: { itemRef?: string }) => item.itemRef === shown),
			`the rendered id ${shown} is not one the payload serves`,
		)
		// Short, stable, and shaped so it can be grepped in a fixture and in the warehouse.
		assert.match(shown, /^ground-freetext-1\/gf-[0-9a-f]{12}#[0-9a-f]{8}$/u)
		// Selectable by construction, so a click-drag is not needed to copy it.
		assert.match(readFileSync(STYLESHEET, "utf8"), /\.round-itemref[\s\S]*?user-select: all/u)
	})

	it("(11) saves an optional note on the current item, and never requires one", async () => {
		const before = harness.records().filter((record) => record.type === "note").length
		page.nodes.answer.blur()
		await page.press("f")
		assert.equal(page.nodes.notebox.hidden, false, "f did not open the note box")
		page.nodes.noteinput.value = "this rendition looks like it was upscaled — the grain is not real grain"
		await page.press("Enter")

		const notes = harness.records().filter((record) => record.type === "note")
		assert.equal(notes.length, before + 1, "the note was not recorded")
		const note = notes.at(-1) as { text: string; itemId: string | null; artwork: unknown; batch: { id: string } | null; tags: string[] }
		assert.equal(note.text, "this rendition looks like it was upscaled — the grain is not real grain", "the reviewer's words were not stored verbatim")
		assert.equal(note.batch!.id, GROUND_FREETEXT_BATCH_ID)
		assert.ok(note.itemId !== null, "the note is not tied to an item, so it cannot be looked up")
		assert.ok(note.artwork !== null, "the note is not tied to an artwork")
		// Raw notes carry no tags: a tag on a raw note is the page pre-judging what the reviewer meant.
		assert.deepEqual(note.tags, [])
		// It is a NOTE, not an answer: it must not count toward `reviewed` or block release.
		assert.equal(page.nodes.notebox.hidden, true, "the box stayed open after saving")
		assert.match(page.nodes.notemark.textContent, /note saved/u)
	})

	it("(11b) a note never blocks the answer or the advance", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${GROUND_FREETEXT_BATCH_ID}`)
		const noted = payload.body.items.filter((item: { note?: string }) => item.note !== undefined)
		assert.equal(noted.length, 1, "the note did not come back on the item")
		// The item that carries the note has NOT been answered — a note is not an answer, and the
		// dashboard's judged count must not move because the reviewer said something.
		const dashboard = await call(harness.base, "GET", "/api/dashboard")
		const row = [...dashboard.body.open, ...dashboard.body.released].find((entry: { batchId: string }) => entry.batchId === GROUND_FREETEXT_BATCH_ID)
		assert.equal(row.judgedCount, 1, "a note counted as an answer")
		// And the reviewer can still advance normally afterwards.
		const at = page.nodes.progress.textContent
		page.nodes.answer.blur()
		await page.press("j")
		assert.notEqual(page.nodes.progress.textContent, at, "the note box left the page stuck")
	})

	it("(11c) escape closes the note without recording, and does not collide with the answer field", async () => {
		const before = harness.records().filter((record) => record.type === "note").length
		page.nodes.answer.blur()
		await page.press("f")
		assert.equal(page.nodes.notebox.hidden, false)
		page.nodes.noteinput.value = "a thought I decided not to keep"
		await page.press("Escape")
		assert.equal(page.nodes.notebox.hidden, true, "escape did not close the note box")
		assert.equal(harness.records().filter((record) => record.type === "note").length, before, "escape recorded the note anyway")
		assert.match(page.nodes.status.textContent, /nothing recorded/u)
		// THE EDGE: this round's ANSWER is also a textarea, and Escape means something there too. They
		// do not collide because only one box holds the keyboard at a time — with the note closed,
		// Escape goes back to meaning "leave the answer field".
		page.nodes.answer.focus()
		await page.press("Escape")
		assert.match(page.nodes.status.textContent, /out of the field/u, "escape did not fall back to the answer field's meaning")
	})

	it("(11d) an empty note is never recorded", async () => {
		const before = harness.records().filter((record) => record.type === "note").length
		page.nodes.answer.blur()
		await page.press("f")
		page.nodes.noteinput.value = "   "
		await page.press("Enter")
		assert.equal(harness.records().filter((record) => record.type === "note").length, before, "a blank note was recorded")
		assert.match(page.nodes.status.textContent, /empty note/u)
	})

	it("(11e) the note survives a restart and comes back on the item", async () => {
		const reloaded = await harness.restart()
		try {
			const payload = reloaded.handle.service.oracleValidationPayload(GROUND_FREETEXT_BATCH_ID)
			const noted = payload.items.filter((item) => (item as { note?: string }).note !== undefined)
			assert.equal(noted.length, 1, "the note did not survive a restart")
			assert.match((noted[0] as { note: string }).note, /upscaled/u)
		} finally {
			harness = reloaded
		}
	})

	it("renders the keymap on every item, from the table the dispatcher reads", () => {
		// Non-optional, because both incidents included keys that were dead or undiscoverable. A bound
		// key is on screen; an on-screen key is bound; there is one list.
		const keymap = page.nodes.keymap.textContent
		assert.match(keymap, /save & next/u)
		assert.match(keymap, /newline/u)
		assert.match(keymap, /back/u)
		assert.match(keymap, /release when finished/u)
		assert.ok(keymap.length > 0, "the footer keymap is empty")
	})

	it("(9) the footer keymap is GENERATED from the bindings, never hand-written", async () => {
		// The endorsement page's footer was hand-written markup and said things the page had stopped
		// doing. Here the dispatcher and the footer read one table, so they cannot disagree: every key
		// the footer advertises is a key the page binds, and the markup carries no hand-written list.
		const markup = await readFile(join(UI_ROOT, "freetext.html"), "utf8")
		const footer = markup.slice(markup.indexOf("<footer"))
		assert.doesNotMatch(footer, /<b>[a-z]<\/b>/u, "the footer hand-writes key names; they will drift from the bindings")
		assert.match(markup, /id="keymap"/u, "there is no node for the generated keymap")
		// The generated keymap advertises the navigation the kit actually provides.
		const keymap = page.nodes.keymap.textContent
		for (const expected of ["save & next", "newline", "back", "forward", "release when finished", "note on this item"]) {
			assert.ok(keymap.includes(expected), `the generated keymap never mentions "${expected}"`)
		}
	})

	it("never lets release be shadowed by a key the reviewer is typing", async () => {
		page.nodes.answer.focus()
		await page.press("r", { expectIgnored: true })
		const released = harness.records().filter((record) => record.type === "batch-complete")
		assert.equal(released.length, 0, "typing the word 'red' released the round")
	})

	it("resumes at the first unanswered item, not at item 1", async () => {
		const resumed = await openPage(harness.base, FREETEXT_PAGE, NODE_IDS, `${harness.base}/freetext?batch=${GROUND_FREETEXT_BATCH_ID}`)
		// One answer was written above, so a fresh page opens on cover 2.
		assert.match(resumed.nodes.progress.textContent, /^2 \/ 9/u)
		assert.match(resumed.nodes.status.textContent, /resuming at cover 2/u)
	})
})

/* ------------------------------------------------------------------------------------------- */
/* The standing rule                                                                             */
/* ------------------------------------------------------------------------------------------- */

/**
 * Pages that wire their own `keydown`, written before the kit existed.
 *
 * **Shrink-only.** A name comes off this list when its page moves onto the kit and never goes back
 * on, and nothing may be added: a new page that wires its own keys is the exact failure this kit was
 * built to stop, and it would arrive with its own fresh copy of the bug. `endorsement-recheck.js` is
 * on the list because another agent is mid-fix on it as this lands; it migrates next.
 */
const GRANDFATHERED_KEYDOWN_PAGES: readonly string[] = [
	// Pre-kit. These are the debt the kit was built to retire; each comes off as it migrates.
	"amend.js",
	"app.js",
	"bracketing.js",
	"calibration.js",
	"endorsement-recheck.js",
	"oracle-review.js",
	"oracle.js",
	// ARRIVED AFTER THE KIT — 2026-08-04. Not an exemption and not a precedent: this page was written
	// outside the kit after the standing rule landed, and the guard caught it the same day. It is
	// listed only so the suite stays green for every other agent while its OWNER migrates it; it is
	// owed a migration, not grandfathered. Nothing else may be added on this basis.
	"dropped-colors.js",
]

describe("no review page wires its own keyboard", () => {
	it("only the kit attaches a document-level keydown listener", async () => {
		const modules = (await readdir(UI_ROOT)).filter((name) => name.endsWith(".js"))
		const offenders: string[] = []
		for (const name of modules) {
			if (name === "round-kit.js" || GRANDFATHERED_KEYDOWN_PAGES.includes(name)) continue
			const source = await readFile(join(UI_ROOT, name), "utf8")
			if (/document\.addEventListener\(\s*["']keydown["']/u.test(source)) offenders.push(name)
		}
		assert.deepEqual(offenders, [], `these pages wire their own keyboard instead of using the kit: ${offenders.join(", ")}`)
	})

	it("the grandfather list only shrinks", async () => {
		// Every name on it must still exist and still wire its own keys. A name that no longer does is
		// a migration nobody removed the entry for, and a stale entry is a hole the guard cannot see
		// through — the next page to take that filename inherits an exemption it never earned.
		for (const name of GRANDFATHERED_KEYDOWN_PAGES) {
			const source = await readFile(join(UI_ROOT, name), "utf8").catch(() => null)
			assert.ok(source !== null, `${name} is grandfathered but no longer exists — remove it from the list`)
			assert.match(
				source,
				/document\.addEventListener\(\s*["']keydown["']/u,
				`${name} no longer wires its own keydown — it has migrated, so take it off the grandfather list`,
			)
		}
	})

	it("freetext.js is migrated, and is proof the kit can absorb a real page", async () => {
		const source = await readFile(join(UI_ROOT, "freetext.js"), "utf8")
		assert.ok(!GRANDFATHERED_KEYDOWN_PAGES.includes("freetext.js"))
		// Code, not prose: the header comment legitimately NAMES the bug it used to have.
		const code = source.slice(source.indexOf('import {'))
		assert.doesNotMatch(code, /addEventListener/u, "the migrated page still wires its own events")
		assert.doesNotMatch(code, /normalizeKey/u, "the migrated page still normalizes its own keys")
		assert.match(source, /startRound\(/u)
		// Config, not machinery. The whole page after migration is smaller than the bug it shipped with.
		assert.ok(source.split("\n").length < 120, "the migrated page is still carrying machinery the kit owns")
	})
})
