/**
 * Serving the review UI from disk — the fix for the failure that kept taking the reviewer's session
 * down, and the guard rails that keep the fix from becoming a file-read proxy.
 *
 * **The failure being tested against, in full.** The server used to hold a hardcoded table mapping
 * every URL to a file in `review-ui/`. The file BYTES were read per request, so editing a page while
 * the server stood worked. The table was compiled into the process, so ADDING a file did not. On
 * 2026-08-03 `keys.js` was extracted as a shared module and `oracle.js` was edited to import it; the
 * server standing at the time served the NEW `oracle.js` and answered 404 for `/keys.js`. A 404 on
 * an ES module import fails the whole module graph silently: no page code runs, the markup's
 * "loading…" stays on screen, and the only evidence is a console line. `it("serves a file created
 * after the server started")` below is that incident, reduced.
 *
 * **The security property that must survive.** Only regular files under `review-ui/`, of the kinds
 * the UI is made of, are served. Containment is checked on the REAL path, so neither `..` nor a
 * symlink planted in the directory reaches outside — the symlink case was a known open note under
 * the old code and is closed here. Every refusal is the same 404: a static server that explains why
 * it said no is a filesystem oracle.
 */
import assert from "node:assert/strict"
import { cp, mkdtemp, rm, symlink, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { createReviewServer, DEFAULT_UI_ROOT, resolveUiFile, type ReviewServerHandle } from "../src/review-server/server.ts"
import { call, makeBatch, TEST_IMAGES } from "../src/review-server/test-support.ts"

const REAL_UI_ROOT = DEFAULT_UI_ROOT
const REPO_PACKAGE_JSON = fileURLToPath(new URL("../../../package.json", import.meta.url))

describe("the review UI is served from disk, per request", () => {
	let root: string
	let uiRoot: string
	let handle: ReviewServerHandle
	let base: string

	before(async () => {
		root = await mkdtemp(join(tmpdir(), "v3-static-"))
		uiRoot = join(root, "review-ui")
		await mkdir(uiRoot)
		await writeFile(join(uiRoot, "dashboard.html"), "<!doctype html><title>dash</title>\n")
		await writeFile(join(uiRoot, "index.html"), "<!doctype html><title>pairwise</title>\n")
		await writeFile(join(uiRoot, "styles.css"), ".dash-body { color: #fff }\n")
		handle = await createReviewServer({
			uiRoot,
			warehousePath: join(root, "warehouse.jsonl"),
			batchLogPath: join(root, "batches.jsonl"),
		})
		base = `http://127.0.0.1:${await handle.listen(0)}`
	})

	after(async () => {
		await handle?.close()
		await rm(root, { recursive: true, force: true })
	})

	it("serves / from dashboard.html and /pairwise from index.html", async () => {
		const home = await call(base, "GET", "/")
		assert.equal(home.status, 200)
		assert.match(String(home.body), /<title>dash<\/title>/u)
		const pairwise = await call(base, "GET", "/pairwise")
		assert.equal(pairwise.status, 200)
		assert.match(String(pairwise.body), /<title>pairwise<\/title>/u)
		// The old link still lands: a path in somebody's notes must not become a 404.
		assert.equal((await call(base, "GET", "/index.html")).status, 200)
	})

	it("serves a file created AFTER the server started — the incident, reduced", async () => {
		// This is exactly the shape of the 2026-08-03 failure: a page is edited to import a shared
		// module that did not exist when the process booted. Under the old route table both requests
		// below were 404, the page's module graph died, and the reviewer saw "loading…" forever.
		assert.equal((await call(base, "GET", "/keys.js")).status, 404, "not written yet")
		await writeFile(join(uiRoot, "keys.js"), "export const normalizeKey = (key) => key\n")
		await writeFile(join(uiRoot, "oracle.html"), '<!doctype html><script type="module" src="/oracle.js"></script>\n')
		await writeFile(join(uiRoot, "oracle.js"), 'import { normalizeKey } from "./keys.js"\n')

		const module_ = await call(base, "GET", "/keys.js")
		assert.equal(module_.status, 200, "a new shared module is servable without a restart")
		assert.equal((await call(base, "GET", "/oracle")).status, 200, "and so is the new page that imports it")
		assert.equal((await call(base, "GET", "/oracle.js")).status, 200)
	})

	it("picks the content type from the extension", async () => {
		const cases: [string, string][] = [
			["/", "text/html"],
			["/styles.css", "text/css"],
			["/keys.js", "text/javascript"],
		]
		for (const [path, type] of cases) {
			const response = await fetch(`${base}${path}`)
			assert.equal(response.status, 200, path)
			assert.ok(response.headers.get("content-type")?.startsWith(type), `${path} → ${response.headers.get("content-type")}`)
		}
	})

	it("refuses traversal, absolute paths and double slashes, all with the same 404", async () => {
		for (const path of [
			"/../server.ts",
			"/../../package.json",
			"/../../../package.json",
			"/..%2f..%2fpackage.json",
			"/%2e%2e/%2e%2e/package.json",
			"//etc/passwd",
			"/etc/passwd",
			"/./../../package.json",
		]) {
			const response = await fetch(`${base}${path}`)
			assert.equal(response.status, 404, `${path} must not be served`)
			const body = await response.text()
			assert.doesNotMatch(body, /"dependencies"|"scripts"/u, `${path} leaked file contents`)
		}
	})

	it("refuses a symlink that points outside the UI root, even though it sits inside it", async () => {
		// The realpath check, which is the whole reason containment is not tested on the joined string.
		await symlink(REPO_PACKAGE_JSON, join(uiRoot, "escape.json"))
		assert.equal((await call(base, "GET", "/escape.json")).status, 404)
		// A symlink INSIDE the root is fine — the rule is about where it lands, not what it is.
		await writeFile(join(uiRoot, "real.css"), ".ok {}\n")
		await symlink(join(uiRoot, "real.css"), join(uiRoot, "alias.css"))
		assert.equal((await call(base, "GET", "/alias.css")).status, 200)
	})

	it("refuses kinds the UI is not made of, and directories", async () => {
		await writeFile(join(uiRoot, "notes.ts"), "export const secret = 1\n")
		await writeFile(join(uiRoot, "notes.md"), "# secret\n")
		await mkdir(join(uiRoot, "sub"))
		await writeFile(join(uiRoot, "sub", "page.html"), "<!doctype html>sub\n")
		assert.equal((await call(base, "GET", "/notes.ts")).status, 404)
		assert.equal((await call(base, "GET", "/notes.md")).status, 404)
		assert.equal((await call(base, "GET", "/sub")).status, 404, "a directory is not a page")
		// A nested file of an allowed kind is fine: the fence is the root, not the depth.
		assert.equal((await call(base, "GET", "/sub/page.html")).status, 200)
	})

	it("never lets a page name shadow an API route", async () => {
		await mkdir(join(uiRoot, "api"))
		await writeFile(join(uiRoot, "api", "queue.html"), "<!doctype html>NOT THE QUEUE\n")
		const queue = await call(base, "GET", "/api/queue")
		assert.equal(queue.status, 200)
		assert.ok(Array.isArray(queue.body.batches), "the API answered, not the file")
		// And an API path with no route stays an API 404, not a page lookup.
		const missing = await call(base, "GET", "/api/nothing-here")
		assert.equal(missing.status, 404)
		assert.match(String(missing.body.error), /No route for GET \/api\/nothing-here/u)
	})

	it("only GET reaches the UI", async () => {
		assert.equal((await call(base, "POST", "/styles.css")).status, 404)
	})
})

describe("a pushed imagePath is contained on the real path too", () => {
	/*
	 * PHASE_0_LOOSE_ENDS A7, closed. The push allowlist used to be a purely lexical `resolve` +
	 * `relative` check, so a symlink sitting inside the allowed root and pointing anywhere at all
	 * walked straight through the one thing that was keeping the server from being a read-any-file
	 * proxy. Same class as the static half, fixed the same way, tested here beside it.
	 */
	let root: string
	let images: string
	let handle: ReviewServerHandle
	let base: string

	before(async () => {
		root = await mkdtemp(join(tmpdir(), "v3-push-root-"))
		images = join(root, "images")
		await mkdir(images)
		await cp(TEST_IMAGES[0], join(images, "cover.jpg"))
		// The symlink lives inside the allowed root; its target does not.
		await symlink(TEST_IMAGES[1], join(images, "escape.jpg"))
		handle = await createReviewServer({
			uiRoot: DEFAULT_UI_ROOT,
			warehousePath: join(root, "warehouse.jsonl"),
			batchLogPath: join(root, "batches.jsonl"),
			imageRoots: [images],
		})
		base = `http://127.0.0.1:${await handle.listen(0)}`
	})

	after(async () => {
		await handle?.close()
		await rm(root, { recursive: true, force: true })
	})

	const push = (batchId: string, imagePath: string) => {
		const batch = makeBatch(batchId, 1)
		return call(base, "POST", "/api/batches", { ...batch, items: batch.items.map((item) => ({ ...item, imagePath })) })
	}

	it("accepts a real file under the root", async () => {
		assert.equal((await push("push-ok", join(images, "cover.jpg"))).status, 201)
	})

	it("refuses a symlink inside the root that points outside it", async () => {
		const refused = await push("push-escape", join(images, "escape.jpg"))
		assert.equal(refused.status, 400)
		assert.match(String(refused.body.error), /must live under/u)
	})

	it("still says 'cannot read' for a path that simply is not there", async () => {
		// The diagnosable-push property: a typo must not be reported as a security refusal.
		const missing = await push("push-missing", join(images, "no-such-file.jpg"))
		assert.equal(missing.status, 400)
		assert.match(String(missing.body.error), /cannot read/u)
	})

	it("refuses a lexical escape as before", async () => {
		const refused = await push("push-updir", join(images, "..", "outside.jpg"))
		assert.equal(refused.status, 400)
		assert.match(String(refused.body.error), /must live under/u)
	})
})

describe("resolveUiFile", () => {
	it("resolves the real UI root's own files", async () => {
		const dashboard = await resolveUiFile(REAL_UI_ROOT, "/")
		assert.ok(dashboard !== null, "/ must resolve to the dashboard")
		assert.match(dashboard.path, /dashboard\.html$/u)
		assert.equal(dashboard.contentType, "text/html; charset=utf-8")
		assert.ok((await resolveUiFile(REAL_UI_ROOT, "/oracle"))?.path.endsWith("oracle.html"))
		assert.ok((await resolveUiFile(REAL_UI_ROOT, "/keys.js"))?.path.endsWith("keys.js"))
	})

	it("returns null rather than explaining itself", async () => {
		for (const path of ["/../package.json", "/nope.js", "/notes.ts", "relative.js", "/%", "/bad%2"]) {
			assert.equal(await resolveUiFile(REAL_UI_ROOT, path), null, path)
		}
	})

	it("returns null for a UI root that does not exist", async () => {
		assert.equal(await resolveUiFile(join(tmpdir(), "no-such-ui-root-xyz"), "/"), null)
	})
})
