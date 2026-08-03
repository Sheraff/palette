/**
 * Helpers for the review-server tests. Not part of the running server.
 *
 * Every test gets its own temporary warehouse and batch log, so tests never touch the reviewer's
 * real data and never depend on each other's writes.
 */
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { WarehouseRecord } from "../warehouse/records.ts"
import { readAll } from "../warehouse/warehouse.ts"
import { createReviewServer, REPO_ROOT, type ReviewServerHandle } from "./server.ts"
import type { PushedBatch } from "./types.ts"

/** Three artworks from the sharded corpus, referenced by absolute path. */
export const TEST_IMAGES = [
	"00/ab67616d00001e02000027594d67b44c00995865.jpg",
	"00/ab67616d00001e0200003a64886c352827bad270.jpg",
	"00/ab67616d00001e02000045168a00c9fa6fcc59da.jpg",
].map((relative) => join(REPO_ROOT, relative))

export type Harness = Readonly<{
	base: string
	handle: ReviewServerHandle
	warehousePath: string
	batchLogPath: string
	records(): WarehouseRecord[]
	stop(): Promise<void>
	/** Close and reopen the server against the same files — the restart-resilience check. */
	restart(): Promise<Harness>
}>

export async function startHarness(directory?: string): Promise<Harness> {
	const root = directory ?? (await mkdtemp(join(tmpdir(), "v3-review-server-")))
	const warehousePath = join(root, "warehouse.jsonl")
	const batchLogPath = join(root, "batches.jsonl")
	const handle = await createReviewServer({ warehousePath, batchLogPath, reviewerId: "test-reviewer" })
	const port = await handle.listen(0)
	return {
		base: `http://127.0.0.1:${port}`,
		handle,
		warehousePath,
		batchLogPath,
		records: () => readAll(warehousePath),
		async stop() {
			await handle.close()
			if (directory === undefined) await rm(root, { recursive: true, force: true })
		},
		async restart() {
			await handle.close()
			return startHarness(root)
		},
	}
}

export async function call(
	base: string,
	method: string,
	path: string,
	body?: unknown,
): Promise<{ status: number; body: any }> {
	const response = await fetch(`${base}${path}`, {
		method,
		headers: body === undefined ? undefined : { "content-type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	})
	const text = await response.text()
	let parsed: unknown = text
	try {
		parsed = JSON.parse(text)
	} catch {
		// A static asset is not JSON; the raw text is what the caller wants.
	}
	return { status: response.status, body: parsed }
}

function hex(index: number, offset: number): string {
	const value = (index * 37 + offset * 91) % 256
	return `#${value.toString(16).padStart(2, "0").repeat(3)}`
}

/**
 * A synthetic batch with distinctive variant ids and fingerprints, so a test can assert that none
 * of them ever reach a served payload.
 */
export function makeBatch(
	batchId: string,
	itemCount: number,
	variantIds: [string, string] = ["VARIANT-LEFT-SECRET", "VARIANT-RIGHT-SECRET"],
): PushedBatch {
	return {
		batchId,
		purpose: "mechanism",
		fundedBy: ["review-server tests"],
		items: Array.from({ length: itemCount }, (_, index) => ({
			itemId: `item-${index}`,
			imagePath: TEST_IMAGES[index % TEST_IMAGES.length],
			sides: [0, 1].map((sideIndex) => ({
				variantId: variantIds[sideIndex],
				fingerprint: {
					algorithmVersion: `FINGERPRINT-VERSION-${sideIndex}-SECRET`,
					preprocessingVersion: "preprocessing-test",
					gitCommit: "0".repeat(40),
					dirty: false,
				},
				palette: {
					background: hex(index, sideIndex),
					surface: hex(index + 1, sideIndex),
					foreground: hex(index + 2, sideIndex),
					accent: hex(index + 3, sideIndex),
					gradient:
						sideIndex === 0
							? null
							: {
									stops: [
										{ color: hex(index, sideIndex), position: 0 },
										{ color: hex(index + 1, sideIndex), position: 1 },
									],
								},
					surfaceCollapsed: false,
					accentCollapsed: false,
				},
			})) as unknown as PushedBatch["items"][number]["sides"],
		})),
	}
}

/**
 * A batch whose palettes all differ and whose gradients sit on varying sides — so no side can be
 * identified by shape, and an unblinding attack has to work on the content hashes. Mirrors the
 * adversarial verifier's generator.
 */
export function makeVariedBatch(batchId: string, itemCount: number): PushedBatch {
	// A tiny LCG: the batch must be varied, and it must be the same varied batch on every run.
	let seed = 12345
	const next = () => {
		seed = (seed * 1103515245 + 12345) % 2147483648
		return seed / 2147483648
	}
	const color = () =>
		`#${[0, 0, 0].map(() => Math.floor(next() * 256).toString(16).padStart(2, "0")).join("")}`
	const palette = (withGradient: boolean) => {
		const background = color()
		const surface = color()
		return {
			background,
			surface,
			foreground: color(),
			accent: color(),
			gradient: withGradient
				? { stops: [{ color: background, position: 0 }, { color: surface, position: 1 }] }
				: null,
			surfaceCollapsed: false,
			accentCollapsed: false,
		}
	}
	return {
		batchId,
		purpose: "arm",
		fundedBy: [],
		items: Array.from({ length: itemCount }, (_, index) => ({
			itemId: `item-${String(index).padStart(3, "0")}`,
			imagePath: TEST_IMAGES[index % TEST_IMAGES.length],
			sides: [0, 1].map((sideIndex) => ({
				variantId: sideIndex === 0 ? "left-variant" : "right-variant",
				fingerprint: {
					algorithmVersion: `algo-${sideIndex}`,
					preprocessingVersion: "pp-1",
					gitCommit: "0".repeat(40),
					dirty: false,
				},
				palette: palette(sideIndex === 0 ? index % 2 === 0 : index % 3 === 0),
			})) as unknown as PushedBatch["items"][number]["sides"],
		})),
	}
}

/* ------------------------------------------------------------------------------------------- */
/* Driving a review page headlessly, with real keystrokes                                        */
/* ------------------------------------------------------------------------------------------- */

/**
 * The smallest DOM a review page can run on.
 *
 * The keyboard-only pages (`bracketing.js`, `oracle.js`) are the one place where a server-side test
 * cannot see the thing that matters: whether the key the reviewer presses records the answer they
 * meant, for the stimulus in front of them. A mapping that is off by one is invisible everywhere
 * else and fatal to the data.
 *
 * The repository installs no browser driver and `CONVENTIONS.md` forbids adding one, so this
 * implements the handful of DOM calls those pages make — element creation, text, children, one
 * keydown listener, `location`, `fetch` — and everything above that line is genuine: the page's own
 * module code, real HTTP, the real server, real warehouse records. Layout and CSS are not covered;
 * those are judged by the reviewer opening the page.
 */
export class FakeNode {
	readonly tagName: string
	className = ""
	children: FakeNode[] = []
	src = ""
	alt = ""
	width = 0
	height = 0
	style: Record<string, string> = {}
	attrs: Record<string, string> = {}
	value = ""
	checked = false
	disabled = false
	#text = ""

	constructor(tagName: string) {
		this.tagName = tagName
	}

	setAttribute(name: string, value: unknown): void {
		this.attrs[name] = String(value)
		if (name === "src") this.src = String(value)
	}

	getAttribute(name: string): string | null {
		return this.attrs[name] ?? null
	}

	readonly listeners = new Map<string, Array<(event: unknown) => void>>()

	/**
	 * Element-level listeners, recorded so a test can drive a form the way the reviewer does.
	 *
	 * The keyboard is still the primary path — but some inputs are genuinely typed into (an
	 * amendment's reason, a comment), and a test that reached into the page's internal state instead
	 * would stop testing the page.
	 */
	addEventListener(type?: string, handler?: (event: unknown) => void): void {
		if (typeof type !== "string" || typeof handler !== "function") return
		const list = this.listeners.get(type) ?? []
		list.push(handler)
		this.listeners.set(type, list)
	}

	dispatch(type: string, event: Record<string, unknown> = {}): void {
		for (const handler of [...(this.listeners.get(type) ?? [])]) {
			handler({ type, preventDefault() {}, target: this, ...event })
		}
	}

	/** Type into a text field: set the value and fire `input`, exactly as a keystroke would. */
	enter(text: string): void {
		this.value = text
		this.dispatch("input")
	}

	focus(): void {}

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

	/** Every node under this one, in document order. */
	descendants(): FakeNode[] {
		return this.children.flatMap((child) => [child, ...child.descendants()])
	}

	/** Only what the pages call: they use `?.` on the result, so null is a valid answer. */
	querySelector(): FakeNode | null {
		return null
	}

	/** Descendants carrying a class, the one query the layout tests need. */
	byClass(className: string): FakeNode[] {
		return this.descendants().filter((node) => node.className.split(" ").includes(className))
	}
}

export type FakePage = Readonly<{
	nodes: Record<string, FakeNode>
	/** Dispatch one key event and wait until something visible changes. Throws if nothing does. */
	press(key: string): Promise<void>
	settle(): Promise<void>
	/** Everything the reviewer can see, as one string — the signal `press` waits on. */
	visible(): string
	stage(): FakeNode
}>

/**
 * Install the shim, then import the page module. The import runs the page's top-level `await
 * start()`, so by the time this resolves the page has loaded its batch and rendered item 1.
 *
 * The module is imported with a cache-busting query so several passes can run in one test process;
 * ESM would otherwise hand back the first instance, still bound to the first server.
 */
export async function openPage(
	base: string,
	modulePath: string,
	nodeIds: readonly string[],
	/** The URL the page thinks it is at — some pages read `?batch=` from it. */
	href = `${base}/`,
): Promise<FakePage> {
	const nodes = Object.fromEntries(nodeIds.map((id) => [id, new FakeNode("div")]))
	const listeners: ((event: unknown) => void)[] = []
	const realFetch = globalThis.fetch

	const globals = globalThis as unknown as Record<string, unknown>
	globals.document = {
		activeElement: null,
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
	globals.location = { href }
	// The pairwise page listens on the window for blur/beforeunload; the tests drive the keyboard, so
	// these only need to exist.
	globals.addEventListener = () => {}
	globals.removeEventListener = () => {}
	// The item pages scroll back to the top when they move between items. Nothing to assert, but it
	// has to exist or navigating by keyboard throws.
	globals.scrollTo = () => {}
	// Relative URLs are what a page uses; Node's fetch needs them resolved against the origin.
	globals.fetch = (input: string, init?: unknown) => realFetch(new URL(String(input), base), init as RequestInit)

	await import(`${modulePath}?pass=${Math.random().toString(36).slice(2)}`)

	// Everything on screen. Two identical answers in a row leave the status line unchanged but move
	// the progress line, so the whole visible state is what "something happened" means.
	const visible = () => nodeIds.map((id) => nodes[id].textContent).join("|")
	const settle = async () => {
		for (let attempt = 0; attempt < 200; attempt++) {
			await new Promise((done) => setTimeout(done, 5))
			if (!nodes[nodeIds.at(-1)!].textContent.startsWith("…")) return
		}
	}
	await settle()

	return {
		nodes,
		visible,
		settle,
		stage: () => nodes.stage,
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
			const before = visible()
			for (const listener of listeners) listener(event)
			assert.ok(prevented, `the page ignored the ${key} key`)
			for (let attempt = 0; attempt < 200; attempt++) {
				await new Promise((done) => setTimeout(done, 5))
				if (visible() !== before) return
			}
			throw new Error(`pressing ${key} produced no visible response (still "${before}")`)
		},
	}
}

export const COMPLETE_VERDICT = {
	gradeA: "strong",
	gradeB: "weak",
	preference: "a",
	comment: "side A keeps the artwork's blue; side B goes grey.",
	confound: false,
	confoundNote: "",
} as const
