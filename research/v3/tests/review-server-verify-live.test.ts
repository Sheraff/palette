/**
 * `verify-live.ts` — the crawl that stands between a push and the reviewer's time.
 *
 * The handoff rule it enforces is: **no URL is handed to the reviewer until this passes against the
 * live process.** So what has to be tested is not that it can say OK — it is that it says NO in each
 * of the ways the handoff has actually broken. The one that matters most is the module graph: a
 * shared module that 404s takes a page down completely while every other signal (process up, API
 * healthy, batch present, page 200) stays green. That is the 2026-08-03 incident, and it is the
 * second test below.
 */
import assert from "node:assert/strict"
import { cp, mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, describe, it } from "node:test"
import {
	createReviewServer,
	DEFAULT_UI_ROOT,
	seedOracleValidationRound,
	type ReviewServerHandle,
} from "../src/review-server/server.ts"
import { call, makeBatch, TEST_IMAGES } from "../src/review-server/test-support.ts"
import { verifyLive, type LiveCheck } from "../src/review-server/verify-live.ts"

/** Start a server on an ephemeral port over a COPY of the real UI, so a test can break one file. */
async function startOver(uiRoot: string, root: string): Promise<{ handle: ReviewServerHandle; base: string }> {
	const handle = await createReviewServer({
		uiRoot,
		warehousePath: join(root, "warehouse.jsonl"),
		batchLogPath: join(root, "batches.jsonl"),
	})
	return { handle, base: `http://127.0.0.1:${await handle.listen(0)}` }
}

function checks(failures: readonly { check: LiveCheck }[]): LiveCheck[] {
	return [...new Set(failures.map((failure) => failure.check))]
}

describe("verify-live", () => {
	let root: string
	let uiRoot: string

	before(async () => {
		root = await mkdtemp(join(tmpdir(), "v3-verify-live-"))
		uiRoot = join(root, "review-ui")
		await cp(DEFAULT_UI_ROOT, uiRoot, { recursive: true })
	})

	after(async () => {
		await rm(root, { recursive: true, force: true })
	})

	it("passes against a healthy server, and reaches the pages, modules, payloads and media", async () => {
		const scratch = await mkdtemp(join(tmpdir(), "v3-vl-ok-"))
		const { handle, base } = await startOver(uiRoot, scratch)
		try {
			assert.equal((await call(base, "POST", "/api/batches", makeBatch("vl-batch", 2))).status, 201)
			await seedOracleValidationRound(handle.service)

			const report = await verifyLive(base)
			assert.deepEqual(report.failures, [], "a healthy server has nothing to report")
			assert.ok(report.ok)
			// It actually walked the thing it claims to walk.
			assert.ok(report.pages.some((url) => url.endsWith("/oracle?batch=oracle-premise-disambiguation-1")))
			assert.ok(report.modules.some((url) => url.endsWith("/keys.js")), "the shared module was reached by import")
			assert.ok(report.modules.some((url) => url.endsWith("/mock.js")))
			// The entry point's own script. It used to be the single module nothing crawled: `/` was
			// fetched before the page loop, so the loop skipped it as seen and never read its markup.
			assert.ok(report.pages.includes(`${base}/`), "the reviewer's entry point is a page like any other")
			assert.ok(report.modules.some((url) => url.endsWith("/dashboard.js")), "including the dashboard's own module")
			assert.equal(report.batches.length, 2)
			assert.ok(
				report.batches.every((batch) => batch.media !== null),
				"both of these modes have media, so both were sampled",
			)
		} finally {
			await handle.close()
			await rm(scratch, { recursive: true, force: true })
		}
	})

	it("fails with MODULE_NOT_OK when a page's import 404s — the incident", async () => {
		const broken = await mkdtemp(join(tmpdir(), "v3-vl-broken-"))
		const brokenUi = join(broken, "review-ui")
		await cp(DEFAULT_UI_ROOT, brokenUi, { recursive: true })
		// Exactly what the reviewer hit: every page still serves, the API is healthy, and the shared
		// module every keyboard page imports is not there.
		await unlink(join(brokenUi, "keys.js"))
		const { handle, base } = await startOver(brokenUi, broken)
		try {
			assert.equal((await call(base, "GET", "/oracle")).status, 200, "the page itself is fine — that is the trap")
			assert.equal((await call(base, "GET", "/api/queue")).status, 200, "and so is the API")

			const report = await verifyLive(base)
			assert.equal(report.ok, false)
			assert.deepEqual(checks(report.failures), ["MODULE_NOT_OK"])
			assert.ok(report.failures.every((failure) => failure.url.endsWith("/keys.js")))
			assert.match(report.failures[0].detail, /loading placeholder/u)
		} finally {
			await handle.close()
			await rm(broken, { recursive: true, force: true })
		}
	})

	it("fails with ASSET_NOT_OK when a stylesheet is missing", async () => {
		const broken = await mkdtemp(join(tmpdir(), "v3-vl-css-"))
		const brokenUi = join(broken, "review-ui")
		await cp(DEFAULT_UI_ROOT, brokenUi, { recursive: true })
		await unlink(join(brokenUi, "styles.css"))
		const { handle, base } = await startOver(brokenUi, broken)
		try {
			const report = await verifyLive(base)
			assert.equal(report.ok, false)
			assert.deepEqual(checks(report.failures), ["ASSET_NOT_OK"])
		} finally {
			await handle.close()
			await rm(broken, { recursive: true, force: true })
		}
	})

	it("fails with PAGE_NOT_OK when a page the dashboard links to is gone", async () => {
		const broken = await mkdtemp(join(tmpdir(), "v3-vl-page-"))
		const brokenUi = join(broken, "review-ui")
		await cp(DEFAULT_UI_ROOT, brokenUi, { recursive: true })
		await unlink(join(brokenUi, "oracle.html"))
		const { handle, base } = await startOver(brokenUi, broken)
		try {
			await seedOracleValidationRound(handle.service)
			const report = await verifyLive(base)
			assert.equal(report.ok, false)
			assert.ok(checks(report.failures).includes("PAGE_NOT_OK"))
			assert.ok(report.failures.some((failure) => failure.url.includes("/oracle")))
		} finally {
			await handle.close()
			await rm(broken, { recursive: true, force: true })
		}
	})

	it("fails with ROOT_NOT_OK when the landing page itself is gone", async () => {
		const broken = await mkdtemp(join(tmpdir(), "v3-vl-root-"))
		const brokenUi = join(broken, "review-ui")
		await cp(DEFAULT_UI_ROOT, brokenUi, { recursive: true })
		await unlink(join(brokenUi, "dashboard.html"))
		const { handle, base } = await startOver(brokenUi, broken)
		try {
			const report = await verifyLive(base)
			assert.equal(report.ok, false)
			assert.ok(checks(report.failures).includes("ROOT_NOT_OK"))
		} finally {
			await handle.close()
			await rm(broken, { recursive: true, force: true })
		}
	})

	it("fails with UNREACHABLE, and nothing else, when no process is listening", async () => {
		const scratch = await mkdtemp(join(tmpdir(), "v3-vl-down-"))
		const { handle, base } = await startOver(uiRoot, scratch)
		await handle.close()
		const report = await verifyLive(base)
		assert.equal(report.ok, false)
		// One failure, not a hundred: a server that is not there fails one way.
		assert.deepEqual(checks(report.failures), ["UNREACHABLE"])
		await rm(scratch, { recursive: true, force: true })
	})

	it("fails with MEDIA_NOT_OK when the artwork behind a queued batch stops serving", async () => {
		const scratch = await mkdtemp(join(tmpdir(), "v3-vl-media-"))
		const images = join(scratch, "images")
		await mkdir(images)
		const copied = join(images, "cover.jpg")
		await cp(TEST_IMAGES[0], copied)
		const handle = await createReviewServer({
			uiRoot,
			warehousePath: join(scratch, "warehouse.jsonl"),
			batchLogPath: join(scratch, "batches.jsonl"),
			imageRoots: [images],
		})
		const base = `http://127.0.0.1:${await handle.listen(0)}`
		try {
			const batch = makeBatch("vl-media", 1)
			const pushed = { ...batch, items: batch.items.map((item) => ({ ...item, imagePath: copied })) }
			assert.equal((await call(base, "POST", "/api/batches", pushed)).status, 201)
			assert.deepEqual((await verifyLive(base)).failures, [], "nothing has moved yet")

			// Custody: the server refuses bytes that no longer hash to what was pushed. That is a 409
			// rather than a 404, and it must still fail the crawl — an item that will not render cannot
			// be judged, whatever the status code says.
			await writeFile(copied, Buffer.from("not an artwork any more"))
			const report = await verifyLive(base)
			assert.equal(report.ok, false)
			assert.deepEqual(checks(report.failures), ["MEDIA_NOT_OK"])
		} finally {
			await handle.close()
			await rm(scratch, { recursive: true, force: true })
		}
	})

	it("crawls the queue and the after-release JSON, not just the pages that load them", async () => {
		// The second incident, pinned. `verify-live` reported ok/0 failures on a server where four of
		// five released oracle rounds offered an adjudication link whose JSON 404'd — because the crawl
		// fetched the *page* and never the data. A page renders "could not load"; the crawl cannot see
		// that. So every endpoint the browser requests has to be requested here too.
		const scratch = await mkdtemp(join(tmpdir(), "v3-vl-revisit-"))
		const { handle, base } = await startOver(uiRoot, scratch)
		try {
			assert.equal((await call(base, "POST", "/api/batches", makeBatch("vl-released", 1))).status, 201)
			const seeded = (await seedOracleValidationRound(handle.service))!
			// Answer every item, then release: the adjudication view exists only after release.
			const round = (await call(base, "GET", `/api/oracle-validation/${seeded}`)).body
			for (const item of round.items) {
				const answer = round.questions.find((question: any) => question.key === item.questionKey).answers[0].key
				assert.equal(
					(await call(base, "PUT", `/api/oracle-validation/${seeded}/items/${item.token}/answer`, { answer })).status,
					200,
				)
			}
			assert.equal((await call(base, "POST", `/api/batches/${seeded}/release`, {})).status, 200)

			const report = await verifyLive(base)
			assert.deepEqual(report.failures, [], "the released round adjudicates cleanly")
			assert.ok(report.visited.includes(`${base}/api/queue`), "five of six review pages open with this call")
			assert.ok(
				report.visited.includes(`${base}/api/oracle-review/${seeded}`),
				"the JSON behind the dashboard's own adjudication link",
			)
			assert.equal(
				report.batches.find((batch) => batch.batchId === seeded)!.afterReleasePayload,
				`${base}/api/oracle-review/${seeded}`,
			)
			// An unreleased batch has no revisit view yet, and the crawl must not invent one.
			assert.equal(report.batches.find((batch) => batch.batchId === "vl-released")!.afterReleasePayload, null)
		} finally {
			await handle.close()
			await rm(scratch, { recursive: true, force: true })
		}
	})

	it("fails when a released batch's revisit JSON is dead, however healthy its page is", async () => {
		// The crawler tested against the shape of server the incident produced, rather than against the
		// server that has since been fixed — otherwise this check can only ever pass vacuously.
		const dashboard = {
			open: [],
			released: [
				{
					batchId: "ghost-round",
					released: true,
					page: "/oracle?batch=ghost-round",
					payload: "/api/oracle-validation/ghost-round",
					afterRelease: "/oracle-review?batch=ghost-round",
					afterReleasePayload: "/api/oracle-review/ghost-round",
				},
			],
			generatedAt: new Date().toISOString(),
		}
		const stub = createServer((request, response) => {
			const path = new URL(request.url!, "http://127.0.0.1").pathname
			const send = (status: number, type: string, body: string) => {
				response.writeHead(status, { "content-type": type })
				response.end(body)
			}
			if (path === "/api/dashboard") return send(200, "application/json", JSON.stringify(dashboard))
			if (path === "/api/queue") return send(200, "application/json", JSON.stringify({ batches: [] }))
			if (path === "/api/oracle-validation/ghost-round") return send(200, "application/json", "{}")
			// Every PAGE is healthy — including the adjudication page itself. Only its data is gone.
			if (!path.startsWith("/api/")) return send(200, "text/html", "<!doctype html><title>ok</title>")
			return send(404, "application/json", JSON.stringify({ error: { message: "no such round here" } }))
		})
		await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", resolve))
		const port = (stub.address() as { port: number }).port
		try {
			const report = await verifyLive(`http://127.0.0.1:${port}`)
			assert.equal(report.ok, false, "a dead revisit link is a failed handoff, not a passing crawl")
			assert.deepEqual(checks(report.failures), ["AFTER_RELEASE_PAYLOAD_NOT_OK"])
			assert.match(report.failures[0].detail, /oracle-review\?batch=ghost-round/u, "it names the link that is dead")
		} finally {
			await new Promise<void>((resolve) => stub.close(() => resolve()))
		}
	})

	it("follows single-quoted markup references too", async () => {
		const broken = await mkdtemp(join(tmpdir(), "v3-vl-quote-"))
		const brokenUi = join(broken, "review-ui")
		await cp(DEFAULT_UI_ROOT, brokenUi, { recursive: true })
		// The crawler exists to notice when the UI changes. An author's choice of quote character is
		// not a reason for it to stop looking.
		await writeFile(
			join(brokenUi, "dashboard.html"),
			"<!doctype html><html><head><link rel='stylesheet' href='/styles.css'>" +
				"<script type='module' src='/not-there.js'></script></head><body></body></html>",
		)
		const { handle, base } = await startOver(brokenUi, broken)
		try {
			const report = await verifyLive(base)
			assert.equal(report.ok, false)
			assert.ok(checks(report.failures).includes("MODULE_NOT_OK"))
			assert.ok(report.failures.some((failure) => failure.url.endsWith("/not-there.js")))
		} finally {
			await handle.close()
			await rm(broken, { recursive: true, force: true })
		}
	})

	it("carries a name for every way it can fail", async () => {
		const named: LiveCheck[] = [
			"UNREACHABLE",
			"ROOT_NOT_OK",
			"ROOT_NOT_HTML",
			"DASHBOARD_API_NOT_OK",
			"DASHBOARD_API_MALFORMED",
			"QUEUE_API_NOT_OK",
			"QUEUE_API_MALFORMED",
			"PAGE_NOT_OK",
			"ASSET_NOT_OK",
			"MODULE_NOT_OK",
			"BATCH_PAYLOAD_NOT_OK",
			"AFTER_RELEASE_PAYLOAD_NOT_OK",
			"MEDIA_NOT_OK",
			"MEDIA_NOT_IMAGE",
			"TIMEOUT",
		]
		const { LIVE_CHECKS } = await import("../src/review-server/verify-live.ts")
		assert.deepEqual([...LIVE_CHECKS], named, "a failure name is part of the interface; changing one is a decision")
	})
})
