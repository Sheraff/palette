/**
 * The oracle-validation page, driven end to end by keystrokes.
 *
 * This runs the **real** `review-ui/oracle.js` — not a copy, not a re-implementation — against the
 * **real** server over HTTP, and answers items by dispatching key events into the handler the page
 * registered. What it proves is the thing unit tests of the server cannot: that pressing `2` on the
 * artwork in front of you writes `shaded_field` for *that* artwork, that `u` steps back and a second
 * answer replaces the first, that reopening the page resumes where you stopped, and that `r`
 * releases. A mapping that is off by one is invisible in every server test and fatal to the data.
 *
 * **Why a DOM shim and not a browser.** The repository installs no browser driver and CONVENTIONS.md
 * forbids adding one. The shim below implements the handful of DOM calls the page makes — element
 * creation, text, children, one keydown listener, `location` and `fetch` — so everything above it is
 * genuine: the page's module code, the HTTP requests, the server, the warehouse records. What is not
 * covered is layout and CSS; those are judged by the reviewer opening the page, not by a test.
 */
import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import type { OracleLabelRecord } from "../src/warehouse/records.ts"
import { isBatchReleased } from "../src/warehouse/warehouse.ts"
import {
	GROUND_TYPE_QUESTION,
	PREMISE_DISAMBIGUATION_BATCH_ID,
	buildPremiseDisambiguationFixture,
} from "../src/review-server/oracle-validation.ts"
import { seedOracleValidationRound } from "../src/review-server/server.ts"
import { readJsonl } from "../src/review-server/store.ts"
import { startHarness, type Harness } from "../src/review-server/test-support.ts"
import type { StoredOracleBatch } from "../src/review-server/types.ts"

const ORACLE_PAGE = fileURLToPath(new URL("../review-ui/oracle.js", import.meta.url))
const BATCH = PREMISE_DISAMBIGUATION_BATCH_ID
const fixture = await buildPremiseDisambiguationFixture()

/* ------------------------------------------------------------------------------------------- */
/* The smallest DOM the page can run on                                                          */
/* ------------------------------------------------------------------------------------------- */

class FakeNode {
	readonly tagName: string
	className = ""
	children: FakeNode[] = []
	src = ""
	alt = ""
	width = 0
	height = 0
	#text = ""

	constructor(tagName: string) {
		this.tagName = tagName
	}

	set textContent(value: unknown) {
		this.#text = String(value)
		this.children = []
	}

	get textContent(): string {
		return this.#text + this.children.map((child) => child.textContent).join(" ")
	}

	append(...children: FakeNode[]): void {
		this.children.push(...children)
	}

	replaceChildren(...children: FakeNode[]): void {
		this.#text = ""
		this.children = children
	}
}

type Page = {
	nodes: Record<string, FakeNode>
	press(key: string): Promise<void>
	settle(): Promise<void>
	stageImage(): FakeNode | null
	mapping(): string[]
}

/**
 * Install the shim, then import the page module. The import runs its top-level `await start()`, so
 * by the time this resolves the page has loaded the queue, fetched the batch and rendered item 1.
 *
 * The module is imported with a cache-busting query so several passes can run in one test process;
 * ESM would otherwise hand back the first instance, still bound to the first server.
 */
async function openPage(base: string): Promise<Page> {
	const ids = ["question", "instruction", "progress", "stage", "mapping", "status"]
	const nodes = Object.fromEntries(ids.map((id) => [id, new FakeNode("div")]))
	const listeners: ((event: unknown) => void)[] = []
	const realFetch = globalThis.fetch

	const globals = globalThis as unknown as Record<string, unknown>
	globals.document = {
		querySelector(selector: string) {
			return nodes[selector.replace("#", "")] ?? null
		},
		createElement(tag: string) {
			return new FakeNode(tag)
		},
		addEventListener(type: string, handler: (event: unknown) => void) {
			if (type === "keydown") listeners.push(handler)
		},
	}
	globals.location = { href: `${base}/oracle` }
	// Relative URLs are what a page uses; Node's fetch needs them resolved against the origin.
	globals.fetch = (input: string, init?: unknown) => realFetch(new URL(String(input), base), init as RequestInit)

	await import(`${ORACLE_PAGE}?pass=${Math.random().toString(36).slice(2)}`)

	const settle = async () => {
		// Let the page's in-flight request and its re-render finish. Polling on the visible status is
		// what a human would do; nothing here reaches into the module's internals.
		for (let attempt = 0; attempt < 200; attempt++) {
			await new Promise((done) => setTimeout(done, 5))
			if (!nodes.status.textContent.startsWith("…")) return
		}
	}
	await settle()

	return {
		nodes,
		async press(key: string) {
			let prevented = false
			const event = {
				key,
				metaKey: false,
				ctrlKey: false,
				altKey: false,
				preventDefault() {
					prevented = true
				},
			}
			// Everything the reviewer can see. Two identical answers in a row leave the status line
			// unchanged but move the progress line, so the whole visible state is the signal.
			const visible = () => `${nodes.status.textContent}|${nodes.progress.textContent}|${nodes.question.textContent}`
			const before_ = visible()
			for (const listener of listeners) listener(event)
			assert.ok(prevented, `the page ignored the ${key} key`)
			for (let attempt = 0; attempt < 200; attempt++) {
				await new Promise((done) => setTimeout(done, 5))
				if (visible() !== before_) return
			}
			throw new Error(`pressing ${key} produced no visible response (still "${before_}")`)
		},
		settle,
		stageImage() {
			return nodes.stage.children.find((child) => child.tagName === "img") ?? null
		},
		mapping() {
			return nodes.mapping.children.map((child) => child.textContent)
		},
	}
}

describe("oracle-validation page, driven by keystrokes", () => {
	let harness: Harness
	let stored: StoredOracleBatch
	let page: Page

	before(async () => {
		harness = await startHarness()
		await seedOracleValidationRound(harness.handle.service)
		stored = (await readJsonl<StoredOracleBatch>(harness.batchLogPath))[0] as StoredOracleBatch
		page = await openPage(harness.base)
	})

	after(async () => {
		await harness?.stop()
	})

	it("opens on the question, the instruction and the whole answer mapping", () => {
		assert.equal(page.nodes.question.textContent, GROUND_TYPE_QUESTION.question)
		assert.equal(page.nodes.instruction.textContent, GROUND_TYPE_QUESTION.instruction)
		const mapping = page.mapping()
		assert.equal(mapping.length, GROUND_TYPE_QUESTION.answers.length)
		for (const [index, answer] of GROUND_TYPE_QUESTION.answers.entries()) {
			assert.ok(mapping[index].includes(answer.hotkey), `${answer.key} does not show its key`)
			assert.ok(mapping[index].includes(answer.label), `${answer.key} does not show its label`)
			assert.ok(mapping[index].includes(answer.gloss), `${answer.key} does not show its gloss`)
		}
		assert.match(page.nodes.progress.textContent, /^1 \/ 30/u)
		assert.match(page.nodes.status.textContent, /resuming at item 1/u)
	})

	it("shows the artwork large, and the artwork's bytes really load", async () => {
		const image = page.stageImage()
		assert.ok(image !== null, "the stage shows no image")
		assert.equal(image.className, "oracle-art")
		assert.match(image.src, /^\/media\//u)
		// Intrinsic size comes from the file header, so the frame does not jump when the bytes arrive.
		const first = fixture.items.find((item) => item.itemId === fixture.serveOrder[0])!
		assert.equal(image.width, first.rendition.width)
		assert.equal(image.height, first.rendition.height)
		const response = await fetch(new URL(image.src, harness.base))
		assert.equal(response.status, 200)
		assert.equal(response.headers.get("content-type"), "image/jpeg")
		assert.ok((await response.arrayBuffer()).byteLength > 1000)
	})

	it("maps each number key to its answer, auto-advances, and records what was on screen", async () => {
		// Walk the first six items with keys 1..6, so every key in the mapping is exercised once.
		const shown: { itemId: string; expected: string }[] = []
		for (const [index, answer] of GROUND_TYPE_QUESTION.answers.entries()) {
			shown.push({ itemId: fixture.serveOrder[index], expected: answer.key })
			assert.match(page.nodes.progress.textContent, new RegExp(`^${index + 1} / 30`, "u"))
			await page.press(answer.hotkey)
			assert.match(page.nodes.status.textContent, new RegExp(`recorded ${answer.key}`, "u"))
		}
		assert.match(page.nodes.progress.textContent, /^7 \/ 30/u, "the page did not auto-advance")

		const labels = harness.records().filter((record): record is OracleLabelRecord => record.type === "oracle-label")
		assert.equal(labels.length, shown.length)
		for (const [index, entry] of shown.entries()) {
			const item = fixture.items.find((candidate) => candidate.itemId === entry.itemId)!
			assert.equal(labels[index].answer, entry.expected, `key ${index + 1} wrote the wrong answer`)
			// The pairing is what matters: the answer must belong to the artwork that was on screen.
			assert.equal(labels[index].artwork?.sha256, item.sha256, `answer ${index + 1} landed on the wrong artwork`)
			assert.equal(labels[index].imageId, item.imageId)
		}
	})

	it("steps back on u and replaces the answer without deleting anything", async () => {
		const beforeCount = harness.records().length
		await page.press("u")
		assert.match(page.nodes.status.textContent, /stepped back/u)
		assert.match(page.nodes.progress.textContent, /^6 \/ 30 · answered none_discernible/u)
		await page.press("1")
		assert.match(page.nodes.status.textContent, /recorded flat_field/u)

		const records = harness.records()
		assert.equal(records.length, beforeCount + 1, "undo appends a new answer; it never deletes one")
		const sixth = fixture.items.find((item) => item.itemId === fixture.serveOrder[5])!
		const forItem = records.filter(
			(record): record is OracleLabelRecord => record.type === "oracle-label" && record.artwork?.sha256 === sixth.sha256,
		)
		assert.deepEqual(forItem.map((record) => record.answer), ["none_discernible", "flat_field"])

		const payload = await (await fetch(new URL(`/api/oracle-validation/${BATCH}`, harness.base))).json()
		assert.equal(payload.items[5].answer, "flat_field", "the latest answer is the reviewer's position")
	})

	it("ignores a key the question does not bind", async () => {
		const before_ = page.nodes.status.textContent
		const progress = page.nodes.progress.textContent
		const count = harness.records().length
		// `7` is outside a six-answer vocabulary, and `q` is not a key at all. Neither may advance, and
		// neither may be swallowed: an unbound key must reach the browser's own handling.
		for (const key of ["7", "0", "q"]) {
			await assert.rejects(() => page.press(key), new RegExp(`the page ignored the ${key} key`, "u"))
		}
		assert.equal(page.nodes.status.textContent, before_)
		assert.equal(page.nodes.progress.textContent, progress)
		assert.equal(harness.records().length, count, "an unbound key wrote a record")
	})

	it("resumes at the first unanswered item when the page is reopened", async () => {
		const reopened = await openPage(harness.base)
		assert.match(reopened.nodes.progress.textContent, /^7 \/ 30/u)
		assert.match(reopened.nodes.status.textContent, /resuming at item 7/u)
		page = reopened
	})

	it("refuses to release while items are unanswered, then releases on r", async () => {
		await page.press("r")
		assert.match(page.nodes.status.textContent, /release refused: .*unjudged items/u)

		for (let remaining = 7; remaining <= fixture.items.length; remaining++) await page.press("2")
		assert.equal(page.stageImage(), null, "the stage should be done, not showing another artwork")
		assert.match(page.nodes.question.textContent, /every item answered/u)

		await page.press("r")
		assert.match(page.nodes.status.textContent, /^released at /u)
		assert.ok(isBatchReleased(harness.records(), BATCH))
		assert.match(page.nodes.stage.textContent, /released/u)

		// Every fixture item has an answer, and every answer belongs to this batch.
		const answered = new Set(
			harness
				.records()
				.filter((record): record is OracleLabelRecord => record.type === "oracle-label")
				.map((record) => record.artwork?.sha256),
		)
		assert.equal(answered.size, fixture.items.length)
		assert.equal(Object.keys(stored.answerTokens).length, fixture.items.length)
	})
})
