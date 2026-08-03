/**
 * The landing dashboard at `/` — the reviewer's single entry point.
 *
 * It exists to answer, without anyone being told anything: is something waiting on me, where is it,
 * how far in am I, and is the server even up. Those were four of the reviewer's five standing
 * complaints about the handoff. So the test is not "the endpoint returns JSON": it is that a batch
 * pushed to the server appears on the page, with a link that actually points at the page that
 * reviews it, and that a released batch stops being in the way.
 *
 * The page itself is driven through the same DOM shim the other page tests use — the real
 * `review-ui/dashboard.js`, over real HTTP, against the real server.
 */
import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { ORACLE_LABEL_SCHEMA_VERSION } from "../src/review-server/oracle-validation.ts"
import { batchReviewPaths, seedOracleValidationRound } from "../src/review-server/server.ts"
import { call, makeBatch, openPage, startHarness, type FakeNode, type Harness } from "../src/review-server/test-support.ts"

const DASHBOARD_PAGE = fileURLToPath(new URL("../review-ui/dashboard.js", import.meta.url))
const NODE_IDS = ["summary", "open", "released", "released-summary", "status"] as const

/** Every `href` the page rendered, in document order. */
function links(node: FakeNode): string[] {
	return node
		.descendants()
		.map((child) => child.getAttribute("href"))
		.filter((href): href is string => href !== null)
}

describe("batchReviewPaths", () => {
	it("sends every kind to the page that reviews it, with the batch named in the URL", () => {
		assert.deepEqual(batchReviewPaths({ batchId: "b-1", kind: "pairwise" }), {
			page: "/pairwise?batch=b-1",
			payload: "/api/batches/b-1",
			afterRelease: "/amend?batch=b-1",
			afterReleasePayload: "/api/batches/b-1",
		})
		assert.deepEqual(batchReviewPaths({ batchId: "b-2", kind: "calibration" }), {
			page: "/calibration?batch=b-2",
			payload: "/api/calibration/b-2",
			afterRelease: "/amend?batch=b-2",
			afterReleasePayload: "/api/calibration/b-2",
		})
		assert.deepEqual(batchReviewPaths({ batchId: "b-3", kind: "bracketing" }), {
			page: "/bracketing?batch=b-3",
			payload: "/api/bracketing/b-3",
			afterRelease: null,
			afterReleasePayload: null,
		})
		assert.deepEqual(
			batchReviewPaths({ batchId: "b-4", kind: "oracle-validation", labelSchemaVersion: ORACLE_LABEL_SCHEMA_VERSION }),
			{
				page: "/oracle?batch=b-4",
				payload: "/api/oracle-validation/b-4",
				afterRelease: "/oracle-review?batch=b-4",
				afterReleasePayload: "/api/oracle-review/b-4",
			},
		)
	})

	it("offers no adjudication link for a question set the adjudication view cannot join", () => {
		// The regression this pins: the link used to be emitted from `kind` alone, so four of the five
		// released oracle rounds — every one answered under a schema other than group-a.v1 — put a link
		// on the dashboard that landed on "could not load". A missing link is a true statement; a dead
		// link is not.
		for (const schema of ["group-bcde.v1", "group-a.probes.v1", "sam-mask-quality.v1", null]) {
			const paths = batchReviewPaths({ batchId: "b-5", kind: "oracle-validation", labelSchemaVersion: schema })
			assert.equal(paths.afterRelease, null, `${String(schema)} has no adjudication view`)
			assert.equal(paths.afterReleasePayload, null, `${String(schema)} has no adjudication payload either`)
			assert.equal(paths.page, "/oracle?batch=b-5", "the answering page is still where the round is reviewed")
		}
	})

	it("escapes a batch id that would otherwise break the link", () => {
		const paths = batchReviewPaths({ batchId: "round 1&2", kind: "oracle-validation" })
		assert.equal(paths.page, "/oracle?batch=round%201%262")
		assert.equal(paths.payload, "/api/oracle-validation/round%201%262")
	})
})

describe("the dashboard endpoint", () => {
	let harness: Harness

	before(async () => {
		harness = await startHarness()
		assert.equal((await call(harness.base, "POST", "/api/batches", makeBatch("dash-pairwise", 3))).status, 201)
		await seedOracleValidationRound(harness.handle.service)
	})

	after(async () => {
		await harness?.stop()
	})

	it("lists every unreleased batch with its progress and its link", async () => {
		const response = await call(harness.base, "GET", "/api/dashboard")
		assert.equal(response.status, 200)
		const ids = response.body.open.map((entry: any) => entry.batchId)
		assert.ok(ids.includes("dash-pairwise"), "a pushed batch is waiting on the reviewer")
		const entry = response.body.open.find((row: any) => row.batchId === "dash-pairwise")
		assert.equal(entry.kind, "pairwise")
		assert.equal(entry.purpose, "mechanism")
		assert.equal(entry.itemCount, 3)
		assert.equal(entry.judgedCount, 0)
		assert.equal(entry.remaining, 3, "the number that says how much work is left")
		assert.equal(entry.page, "/pairwise?batch=dash-pairwise")
		assert.equal(entry.payload, "/api/batches/dash-pairwise")
		assert.deepEqual(response.body.released, [])
	})

	it("counts progress as the reviewer makes it", async () => {
		await call(harness.base, "PUT", "/api/batches/dash-pairwise/items/item-0/verdict", {
			gradeA: "strong",
			gradeB: "weak",
			preference: "a",
			comment: "A keeps the blue.",
			confound: false,
			confoundNote: "",
		})
		const entry = (await call(harness.base, "GET", "/api/dashboard")).body.open.find(
			(row: any) => row.batchId === "dash-pairwise",
		)
		assert.equal(entry.judgedCount, 1)
		assert.equal(entry.remaining, 2)
	})

	it("every link it publishes actually serves", async () => {
		const body = (await call(harness.base, "GET", "/api/dashboard")).body
		for (const entry of [...body.open, ...body.released]) {
			assert.equal((await call(harness.base, "GET", entry.page)).status, 200, `page ${entry.page}`)
			assert.equal((await call(harness.base, "GET", entry.payload)).status, 200, `payload ${entry.payload}`)
		}
	})

	it("moves a released batch out of the queue and into the collapsed history", async () => {
		for (const item of ["item-1", "item-2"]) {
			await call(harness.base, "PUT", `/api/batches/dash-pairwise/items/${item}/verdict`, {
				gradeA: "strong",
				gradeB: "weak",
				preference: "a",
				comment: "same again.",
				confound: false,
				confoundNote: "",
			})
		}
		assert.equal((await call(harness.base, "POST", "/api/batches/dash-pairwise/release", {})).status, 200)
		const body = (await call(harness.base, "GET", "/api/dashboard")).body
		assert.ok(
			!body.open.some((entry: any) => entry.batchId === "dash-pairwise"),
			"a released batch is not waiting on anybody",
		)
		const done = body.released.find((entry: any) => entry.batchId === "dash-pairwise")
		assert.ok(done !== undefined)
		assert.equal(done.afterRelease, "/amend?batch=dash-pairwise", "and it says where a second thought goes")
	})
})

describe("the dashboard page", () => {
	let harness: Harness

	after(async () => {
		await harness?.stop()
	})

	it("names what is waiting, how far in it is, and links straight to it", async () => {
		harness = await startHarness()
		assert.equal((await call(harness.base, "POST", "/api/batches", makeBatch("page-batch", 4))).status, 201)
		const page = await openPage(harness.base, DASHBOARD_PAGE, NODE_IDS)

		assert.match(page.nodes.summary.textContent, /1 round waiting on you/u)
		assert.match(page.nodes.summary.textContent, /4 items left/u)
		const shown = page.nodes.open.textContent
		assert.match(shown, /page-batch/u, "the batch is named")
		assert.match(shown, /pairwise/u, "and so is its mode")
		assert.match(shown, /0 \/ 4 answered/u, "progress is on screen without opening it")
		assert.ok(
			links(page.nodes.open).includes("/pairwise?batch=page-batch"),
			`the direct link is there — got ${JSON.stringify(links(page.nodes.open))}`,
		)
	})

	it("says so plainly when nothing is waiting", async () => {
		const empty = await startHarness()
		try {
			const page = await openPage(empty.base, DASHBOARD_PAGE, NODE_IDS)
			assert.match(page.nodes.summary.textContent, /nothing is waiting on you/u)
			assert.match(page.nodes.open.textContent, /queue is empty/u)
		} finally {
			await empty.stop()
		}
	})

	it("says the server is unreachable instead of looking like an empty queue", async () => {
		const dead = await startHarness()
		const base = dead.base
		await dead.stop()
		const page = await openPage(base, DASHBOARD_PAGE, NODE_IDS)
		assert.match(page.nodes.status.textContent, /cannot reach the review server/u)
		assert.match(page.nodes.status.textContent, /do not start it yourself/u)
	})
})
