/**
 * The round kit's **browse mode**, executed as a page — and the dev loop's two viewers, which are the
 * only pages that use it.
 *
 * **Why this file is in the kit suite and not somewhere of its own.** `ROUND_KIT.md`'s standing rule
 * is that no review page is written outside the kit, and the reason is the three pages that shipped
 * broken in three days: each had re-implemented fetch, navigation and key handling, and each got a
 * fresh chance to get one of them wrong. A read-only viewer needs all of that and records nothing, so
 * it is a **widget**, not a second framework — and a widget is tested where the kit is tested.
 *
 * **What the harness could not do until now.** The kit's rule (4) requires dynamic imports to be
 * root-absolute (`import("/mock.js")`), because a relative specifier resolves against the importing
 * module's URL, which is not the directory a page is served from once it has a route. Under Node that
 * specifier is a filesystem path and resolves to nothing, so *no page using the pinned mock player
 * had ever been executed in a test* — the mock is the primary judging surface (REVIEW_UI.md §3) and
 * it was the one renderer the harness could not reach. The `registerHooks` shim below closes that,
 * and both pages here render the real `mock.js`.
 *
 * The behaviours asserted, each one a way a browse page could look fine and be wrong:
 *
 *  1. it renders the real mock, with the real palettes, from the real run file on disk,
 *  2. it navigates without recording, and there is nothing it *could* record,
 *  3. the keymap advertises movement and nothing else — no release, no undo, no note, no answer,
 *  4. `r` and the answer digits are left unhandled rather than swallowed,
 *  5. the diff page shows before and after together, biggest change first,
 *  6. every class either page renders matches a real rule in `styles.css`.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { registerHooks } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { after, before, describe, it } from "node:test"
import sharp from "sharp"
import { openPage, type FakePage } from "../src/review-server/test-support.ts"
import { createDevLoopServer, type DevLoopServerHandle } from "../src/devloop/serve.ts"
import { runCandidate } from "../src/devloop/run.ts"
import { V3_ROOT } from "../src/devloop/code-version.ts"

const UI_ROOT = fileURLToPath(new URL("../review-ui/", import.meta.url))
const STYLESHEET = join(UI_ROOT, "styles.css")
const STYLED_CLASSES = new Set([...readFileSync(STYLESHEET, "utf8").matchAll(/\.([a-zA-Z][\w-]*)/gu)].map((match) => match[1]))
const RUN_PAGE = join(UI_ROOT, "devloop-run.js")
const DIFF_PAGE = join(UI_ROOT, "devloop-diff.js")

/**
 * Teach the module loader the one thing a browser already knows: `/mock.js` is a URL rooted at the
 * served directory, not a path at the root of the filesystem.
 *
 * Without this the kit's own rule (4) — dynamic imports must be root-absolute — makes every page that
 * renders a palette untestable, which is exactly the corner all three broken pages were shipped from.
 */
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier.startsWith("/") && specifier.endsWith(".js")) {
			return { url: pathToFileURL(join(UI_ROOT, specifier)).href, shortCircuit: true }
		}
		return nextResolve(specifier, context)
	},
})

const NODE_IDS = ["preamble", "question", "instruction", "progress", "stage", "context", "itemref", "keymap", "status"] as const

let root: string
let handle: DevLoopServerHandle
let base: string
let runId: string
let diffId: string

/** A fixture candidate that differs from the toy, so a diff between the two runs has content. */
const FIXTURE_CANDIDATE = `
import { readFile } from "node:fs/promises"
export const candidateId = "fixture-other"
export const paletteOf = async (imagePath) => {
	const bytes = await readFile(imagePath)
	const value = bytes.length % 200
	const color = (offset) => {
		const rgb = [(value + offset * 30) % 256, (value + offset * 11) % 256, (value + offset * 57) % 256]
		return { rgb, hex: "#" + rgb.map((c) => c.toString(16).padStart(2, "0")).join("") }
	}
	return {
		contractVersion: "v3-contract-0.1.0",
		roles: { background: color(0), surface: color(1), foreground: color(2), accent: color(3) },
		gradient: null,
		collapse: { surfaceCollapsed: false, accentCollapsed: false },
		contrast: { minTextContrast: { requestedLc: 0, effectiveRawMagnitude: 2.5 }, minAccentContrast: { requestedLc: 0, effectiveRawMagnitude: 2.5 } },
		metadata: {
			algorithmVersion: "fixture-other",
			preprocessingVersion: "none",
			inputContentHash: "0".repeat(64),
			sourceRendition: { path: imagePath, width: 8, height: 8, format: "png" },
			processedSize: { width: 8, height: 8 },
		},
	}
}
`

before(async () => {
	root = await mkdtemp(join(tmpdir(), "devloop-browse-"))
	const imagesDir = join(root, "images")
	const runsDir = join(root, "runs")
	await mkdir(imagesDir, { recursive: true })
	await mkdir(runsDir, { recursive: true })

	// Three tiny covers, each a different colour, so every item on screen is distinguishable.
	const paths: string[] = []
	for (let index = 0; index < 3; index += 1) {
		const path = join(imagesDir, `cover-${index}.png`)
		await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 20 + index * 60, g: 90, b: 200 - index * 50 } } })
			.png()
			.toFile(path)
		paths.push(path)
	}
	const setPath = join(root, "set.txt")
	await writeFile(setPath, paths.join("\n"), "utf8")

	const other = join(root, "fixture-other.ts")
	await writeFile(other, FIXTURE_CANDIDATE, "utf8")

	// Two runs over the SAME set: the real toy, then a different candidate. Same set hash, so the
	// server offers the pair as a diff.
	const first = await runCandidate({
		candidatePath: join(V3_ROOT, "src", "devloop", "candidates", "toy-median-offsets.ts"),
		setPath,
		outPath: join(runsDir, "run-toy.jsonl"),
		cacheRoot: join(root, "cache"),
		quiet: true,
	})
	const second = await runCandidate({
		candidatePath: other,
		setPath,
		outPath: join(runsDir, "run-other.jsonl"),
		cacheRoot: join(root, "cache"),
		quiet: true,
	})
	runId = first.header.runId
	diffId = `${first.header.runId}..${second.header.runId}`

	handle = createDevLoopServer({ runsRoot: runsDir })
	base = `http://127.0.0.1:${await handle.listen(0)}`
})

after(async () => {
	await handle?.close()
	await rm(root, { recursive: true, force: true })
})

/** Every class the page actually rendered — walked, so runtime template classes are covered too. */
function unstyledClasses(page: FakePage): string[] {
	const unstyled = new Set<string>()
	const walk = (node: { className: string; children: unknown[] }): void => {
		for (const token of node.className.split(" ")) {
			if (token.length > 0 && !STYLED_CLASSES.has(token)) unstyled.add(token)
		}
		for (const child of node.children) walk(child as never)
	}
	for (const id of NODE_IDS) walk(page.nodes[id] as never)
	return [...unstyled]
}

describe("the run viewer, executed as a page", () => {
	let page: FakePage

	before(async () => {
		page = await openPage(base, RUN_PAGE, NODE_IDS, `${base}/devloop-run.html?batch=${encodeURIComponent(runId)}`)
	})

	it("renders the real mock player with the run's real palettes", () => {
		// The mock is the primary judging surface and there is exactly one renderer of it. A viewer with
		// its own copy would be showing a developer something no reviewer will ever see.
		const stage = page.stage()
		assert.equal(stage.byClass("mock").length, 1, "the pinned mock player did not render")
		assert.ok(stage.byClass("mock-art").length > 0, "the artwork is not in the mock")
		const swatches = stage.byClass("swatches")
		assert.equal(swatches.length, 1)
		// Four roles, each named via colornames-oklab alongside its hex (CONVENTIONS.md).
		assert.match(swatches[0].textContent, /background/u)
		assert.match(swatches[0].textContent, /#[0-9a-f]{6}/u)
	})

	it("does not sit on 'loading…' — it loaded, and says what it loaded", () => {
		assert.doesNotMatch(page.nodes.question.textContent, /loading/iu)
		assert.match(page.nodes.question.textContent, /toy-median-offsets/u)
		assert.match(page.nodes.status.textContent, /read-only/u)
		assert.match(page.nodes.progress.textContent, /^1 \/ 3$/u, "browse progress should be position only")
	})

	it("moves between covers and records nothing", async () => {
		await page.press("j")
		assert.match(page.nodes.progress.textContent, /^2 \/ 3$/u)
		await page.press("k")
		assert.match(page.nodes.progress.textContent, /^1 \/ 3$/u)
		// Clamped at the front, exactly as a round is.
		await page.press("k").catch(() => {})
		assert.match(page.nodes.progress.textContent, /^1 \/ 3$/u)
	})

	it("advertises movement and nothing else", () => {
		const keymap = page.nodes.keymap.textContent
		assert.match(keymap, /back/u)
		assert.match(keymap, /forward/u)
		// A key on screen is a key that is bound. There is no round to release, nothing to undo, and no
		// note to file, so none of them may be advertised.
		assert.doesNotMatch(keymap, /release/u)
		assert.doesNotMatch(keymap, /undo/u)
		assert.doesNotMatch(keymap, /note/u)
	})

	it("leaves the answering keys unhandled rather than swallowing them", async () => {
		// `r` releases a round and `1` answers one. Neither means anything here, and a page that
		// swallowed them would be a page that looks like it did something.
		await page.press("r", { expectIgnored: true })
		await page.press("1", { expectIgnored: true })
		await page.press("f", { expectIgnored: true })
		await page.press("u", { expectIgnored: true })
	})

	it("shows the copyable item id, so a developer can name the cover they mean", () => {
		assert.match(page.nodes.itemref.textContent, /^[\w.-]+\/row-\d{4}#[0-9a-f]{8}$/u)
	})

	it("shows the path and where the row came from", () => {
		assert.match(page.nodes.context.textContent, /cover-0\.png/u)
		assert.match(page.nodes.context.textContent, /computed in|from cache/u)
	})

	it("renders no class that styles.css has no rule for", () => {
		assert.deepEqual(unstyledClasses(page), [], "these classes render unstyled in the browser")
	})
})

describe("the diff viewer, executed as a page", () => {
	let page: FakePage

	before(async () => {
		page = await openPage(base, DIFF_PAGE, NODE_IDS, `${base}/devloop-diff.html?batch=${encodeURIComponent(diffId)}`)
	})

	it("shows before and after together, as two mocks over one cover", () => {
		const stage = page.stage()
		assert.equal(stage.byClass("mock").length, 2, "a diff must show both palettes at once")
		assert.equal(stage.byClass("round-composite").length, 1)
		const headings = stage.descendants().filter((node) => node.tagName === "h2").map((node) => node.textContent)
		assert.deepEqual(headings, ["side before", "side after"])
	})

	it("opens on the biggest change, and says how big it is", () => {
		assert.match(page.nodes.question.textContent, /covers changed — biggest first/u)
		assert.match(page.nodes.context.textContent, /max role-pair OKLab distance \d\.\d{4} on (background|surface|foreground|accent)/u)
		// The per-role breakdown travels with the headline number.
		assert.match(page.nodes.context.textContent, /background \d\.\d{4}/u)
	})

	it("lists covers in descending order of change", async () => {
		const magnitudeOf = (text: string): number => Number(/distance (\d\.\d+)/u.exec(text)?.[1] ?? "NaN")
		const first = magnitudeOf(page.nodes.context.textContent)
		await page.press("j")
		const second = magnitudeOf(page.nodes.context.textContent)
		assert.ok(Number.isFinite(first) && Number.isFinite(second), "no magnitude on screen")
		assert.ok(first >= second, `the diff is not descending: ${first} then ${second}`)
	})

	it("records nothing either", async () => {
		await page.press("r", { expectIgnored: true })
		assert.doesNotMatch(page.nodes.keymap.textContent, /release/u)
	})

	it("renders no class that styles.css has no rule for", () => {
		assert.deepEqual(unstyledClasses(page), [])
	})
})

describe("browse mode records nothing, structurally", () => {
	it("the one function in the kit that posts an answer refuses before it has a URL", async () => {
		// Not a convention and not a guard that can be reasoned around: `post` throws in browse mode, so
		// no configuration of a browse page can write an answer anywhere.
		const source = await readFile(join(UI_ROOT, "round-kit.js"), "utf8")
		const post = source.slice(source.indexOf("async function post("))
		assert.match(post.slice(0, 400), /if \(browse\) throw new Error/u, "post() can still write in browse mode")
	})

	it("the dev loop's pages ask for browse mode and never wire their own keyboard", async () => {
		for (const path of [RUN_PAGE, DIFF_PAGE]) {
			const source = await readFile(path, "utf8")
			assert.match(source, /browse: true/u, `${path} does not ask for browse mode`)
			assert.doesNotMatch(source, /addEventListener/u, `${path} wires its own events`)
			assert.doesNotMatch(source, /normalizeKey/u, `${path} normalizes its own keys`)
			assert.doesNotMatch(source, /\bfetch\(/u, `${path} does its own fetching`)
		}
	})

	it("the dev loop's server refuses every method that is not a read", async () => {
		for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
			const response = await fetch(`${base}/api/devloop-run/${encodeURIComponent(runId)}`, { method })
			assert.equal(response.status, 405, `${method} was not refused`)
		}
		assert.equal((await fetch(`${base}/api/queue`)).status, 200)
	})

	it("serves the artwork bytes for a row", async () => {
		const response = await fetch(`${base}/api/devloop-media/${encodeURIComponent(runId)}/0`)
		assert.equal(response.status, 200)
		assert.equal(response.headers.get("content-type"), "image/png")
		assert.ok((await response.arrayBuffer()).byteLength > 0)
	})
})
