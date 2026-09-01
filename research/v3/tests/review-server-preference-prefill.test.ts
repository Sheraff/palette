/**
 * The preference the two grades already imply, filled in for the reviewer.
 *
 * Reviewer, 2026-08-03, testing the pairwise page: *"if I rate 'A strong' and then 'B weak' I should
 * not have to rate 'A is better' (this should autofill if individual ratings for A and B are not the
 * same)"*. They are right, and the interesting half of the feature is what it must NOT do:
 *
 *  - **equal grades never prefill.** Two strongs are not interchangeable (regrade agreement ~88%,
 *    REVIEW_UI.md §2), so inferring an order there would invent an ordering constraint the reviewer
 *    never made — and "no preference" is itself a statement, so it is pressed too.
 *  - **an explicit choice is never overwritten** by a later regrade.
 *  - **a prefill that stops being implied is withdrawn**, not left behind as a stale answer.
 *
 * And because a preference can now exist without anyone pressing it, every verdict records which of
 * the two happened, in `preferenceSource`. That flag is what keeps a convenience from quietly
 * becoming evidence: adjudication can ask for pressed preferences only, and nothing has to guess.
 *
 * Driven through the real `review-ui/app.js` against the real server, by real keystrokes.
 */
import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import type { VerdictRecord } from "../src/warehouse/records.ts"
import { call, makeBatch, openPage, startHarness, type FakePage, type Harness } from "../src/review-server/test-support.ts"
import type { StoredVerdictRecord } from "../src/review-server/types.ts"

const APP_PAGE = fileURLToPath(new URL("../review-ui/app.js", import.meta.url))
const NODE_IDS = ["batch-line", "item-nav", "prev", "next", "release", "release-note", "item", "status"] as const
const BATCH = "prefill-batch"

/** Every verdict written for one item, oldest first — the page appends one per save. */
function verdicts(harness: Harness, itemId: string): StoredVerdictRecord[] {
	return harness
		.records()
		.filter((record): record is VerdictRecord => record.type === "verdict" && record.itemId === itemId)
}

async function waitFor(what: string, predicate: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 300; attempt++) {
		if (predicate()) return
		await new Promise((done) => setTimeout(done, 5))
	}
	assert.fail(what)
}

describe("preference prefill from the two grades", () => {
	let harness: Harness
	let page: FakePage

	/**
	 * Wait until an item's save has both landed in the log and reported itself on the status line.
	 *
	 * A save is a round trip, and its "saved …" message arrives after the keystroke that started it.
	 * Anything asserting on the status line has to let the previous save finish first, or it is
	 * asserting on a race and not on the page.
	 */
	async function settled(itemId: string, count: number): Promise<void> {
		await waitFor(`${itemId} should have ${count} saved verdict(s), reported on the status line`, () => {
			return verdicts(harness, itemId).length === count && page.nodes.status.textContent.includes(`saved ${itemId}`)
		})
	}

	before(async () => {
		harness = await startHarness()
		await call(harness.base, "POST", "/api/batches", makeBatch(BATCH, 3))
		page = await openPage(harness.base, APP_PAGE, NODE_IDS, `${harness.base}/?batch=${BATCH}`)
	})

	after(async () => {
		await harness?.stop()
	})

	it("prefills the better-graded side, and says so on screen", async () => {
		// `1` grades side A strong; `8` grades side B weak. The reviewer never touches the preference.
		await page.press("1")
		await page.press("8")
		await settled("item-0", 1)

		const standing = verdicts(harness, "item-0").at(-1)!
		assert.equal(standing.gradeA, "strong")
		assert.equal(standing.gradeB, "weak")
		assert.equal(standing.preference, "a", "the better-graded side should be the preference")
		assert.equal(standing.preferenceSource, "prefilled", "a preference nobody pressed must not read as pressed")

		// On screen, next to the buttons: a prefill the reviewer never noticed is a preference they
		// never gave.
		assert.match(page.nodes.item.textContent, /prefilled from the grades/u)
		assert.match(page.nodes.item.textContent, /side A is graded higher/u)
	})

	it("stays overridable, and an override is recorded as pressed", async () => {
		await page.press("b")
		await settled("item-0", 2)

		const standing = verdicts(harness, "item-0").at(-1)!
		assert.equal(standing.preference, "b", "the reviewer's own choice must win over the prefill")
		assert.equal(standing.preferenceSource, "explicit")
		// The prefill note is gone: nothing is being filled in any more.
		assert.ok(!page.nodes.item.textContent.includes("prefilled from the grades"))
		// Nothing was rewritten: the prefilled verdict is still in the log, superseded, not edited.
		assert.equal(verdicts(harness, "item-0").length, 2)
		assert.equal(verdicts(harness, "item-0")[0].preference, "a")
	})

	it("never undoes an explicit choice on a later regrade", async () => {
		// A is regraded to acceptable, which still beats weak — the prefill rule would say "a". It must
		// not: the reviewer pressed `b`, and a machine that quietly undoes that is worse than one that
		// never helped.
		await page.press("2")
		await settled("item-0", 3)

		const standing = verdicts(harness, "item-0").at(-1)!
		assert.equal(standing.gradeA, "acceptable")
		assert.equal(standing.preference, "b")
		assert.equal(standing.preferenceSource, "explicit")
	})

	it("asks for an explicit choice when the two grades are equal", async () => {
		await page.press("ArrowRight")
		// Both sides strong. Nothing is implied by that, so nothing is filled in and the item stays
		// unjudged until the reviewer says something.
		await page.press("1")
		await page.press("6")
		assert.match(page.nodes.status.textContent, /needs a grade for A, a grade for B, and a preference/u)
		assert.match(page.nodes.item.textContent, /both sides are graded the same/u)
		assert.equal(verdicts(harness, "item-1").length, 0, "an equal-grades item must not save a guessed preference")

		// "No preference" is a statement too, and it is pressed like any other.
		await page.press("n")
		await waitFor("the explicit no-preference should save", () => verdicts(harness, "item-1").length > 0)
		const standing = verdicts(harness, "item-1").at(-1)!
		assert.equal(standing.preference, "no-preference")
		assert.equal(standing.preferenceSource, "explicit")
	})

	it("withdraws a prefill the grades no longer imply", async () => {
		await page.press("ArrowRight")
		await page.press("1")
		await page.press("8")
		await settled("item-2", 1)
		assert.equal(verdicts(harness, "item-2").at(-1)!.preference, "a")

		// Side B is regraded to strong: the grades are now equal, and the prefilled "A is better" is no
		// longer implied by anything. It goes away, and the item is unjudged again.
		await page.press("6")
		assert.match(page.nodes.status.textContent, /needs a grade for A, a grade for B, and a preference/u)
		assert.match(page.nodes.item.textContent, /both sides are graded the same/u)
		assert.ok(!page.nodes.item.textContent.includes("prefilled from the grades"))
		// The earlier record stays in the log — nothing here ever rewrites one — but no new verdict was
		// written from a preference that is no longer the reviewer's position.
		assert.equal(verdicts(harness, "item-2").length, 1)
	})
})

describe("preferenceSource on the wire and in the log", () => {
	let harness: Harness
	const item = (itemId: string) => `/api/batches/wire-batch/items/${itemId}/verdict`

	before(async () => {
		harness = await startHarness()
		await call(harness.base, "POST", "/api/batches", makeBatch("wire-batch", 2))
	})

	after(async () => {
		await harness?.stop()
	})

	it("refuses a value that is neither prefilled nor explicit, writing nothing", async () => {
		const refused = await call(harness.base, "PUT", item("item-0"), {
			gradeA: "strong",
			gradeB: "weak",
			preference: "a",
			preferenceSource: "guessed",
			comment: "",
			confound: false,
			confoundNote: "",
		})
		assert.equal(refused.status, 400)
		assert.match(refused.body.error, /preferenceSource must be one of/u)
		assert.equal(harness.records().length, 0)
	})

	it("reads a missing flag as explicit — nothing prefilled a caller that does not have the feature", async () => {
		const saved = await call(harness.base, "PUT", item("item-0"), {
			gradeA: "strong",
			gradeB: "weak",
			preference: "a",
			comment: "no prefill machinery on this caller",
			confound: false,
			confoundNote: "",
		})
		assert.equal(saved.status, 200)
		const record = harness.records().find((entry): entry is VerdictRecord => entry.type === "verdict")!
		assert.equal((record as StoredVerdictRecord).preferenceSource, "explicit")
	})

	it("serves the flag back and keeps it across a restart", async () => {
		await call(harness.base, "PUT", item("item-1"), {
			gradeA: "weak",
			gradeB: "strong",
			preference: "b",
			preferenceSource: "prefilled",
			comment: "",
			confound: false,
			confoundNote: "",
		})
		const payload = await call(harness.base, "GET", "/api/batches/wire-batch")
		const served = payload.body.items.find((entry: any) => entry.itemId === "item-1")
		assert.equal(served.verdict.preferenceSource, "prefilled", "a reloaded page must know it may still re-prefill")

		harness = await harness.restart()
		const afterRestart = await call(harness.base, "GET", "/api/batches/wire-batch")
		const again = afterRestart.body.items.find((entry: any) => entry.itemId === "item-1")
		assert.equal(again.verdict.preferenceSource, "prefilled", "the flag must survive the replay, like every other field")
		// It is an additive field on an ordinary verdict record: the warehouse validated and stored it
		// without knowing it, and the schema version did not move.
		const record = harness
			.records()
			.find((entry): entry is VerdictRecord => entry.type === "verdict" && entry.itemId === "item-1")!
		assert.equal(record.schema, "v3.0")
		assert.equal((record as StoredVerdictRecord).preferenceSource, "prefilled")
	})

	it("has no meaning in absolute grading, and says so rather than dropping it", async () => {
		await call(harness.base, "POST", "/api/calibration", {
			batchId: "wire-calibration",
			purpose: "calibration",
			fundedBy: [],
			items: [
				{
					itemId: "cal-0",
					imagePath: (await import("../src/review-server/test-support.ts")).TEST_IMAGES[0],
					variantId: "v",
					fingerprint: { algorithmVersion: "a", preprocessingVersion: "p", gitCommit: "0".repeat(40), dirty: false },
					palette: {
						background: "#101010",
						surface: "#202020",
						foreground: "#f0f0f0",
						accent: "#c04040",
						gradient: null,
						surfaceCollapsed: false,
						accentCollapsed: false,
					},
				},
			],
		})
		const refused = await call(harness.base, "PUT", "/api/calibration/wire-calibration/items/cal-0/verdict", {
			grade: "strong",
			comment: "",
			preferenceSource: "prefilled",
		})
		assert.equal(refused.status, 400)
		assert.match(refused.body.error, /preferenceSource has no meaning in absolute/u)
	})
})
