/**
 * Crawl a RUNNING review server and prove the reviewer can actually use it.
 *
 * This is the last step of every push and every deploy, and it is not optional:
 *
 *     **No URL is handed to the reviewer until `verify-live` passes against the live process.**
 *
 * The rule exists because of a specific, repeated failure. Twice, the reviewer opened a review URL
 * and got a page stuck on "loading…" with 404s in the console. The last one was a shared module
 * (`keys.js`) that the standing server would not serve: the page's own file was served fresh from
 * disk, the module it imported was not, and a 404 on an ES module import kills the whole graph in
 * silence — no page code runs and the markup's placeholder stays on screen forever. Nothing about
 * that is visible to whoever pushed the batch. The server was up, the API was healthy, the batch was
 * there, and the page was dead.
 *
 * So this crawls what a browser would actually request, against the process that is actually
 * listening:
 *
 *   1. `/` — the dashboard the reviewer is told to open.
 *   2. `/api/dashboard` — which enumerates every batch and, crucially, the URL of each one's page.
 *   3. every page (the dashboard's links plus every review mode), and every asset those pages
 *      reference — **including the transitive module graph of every script**, which is the check
 *      that would have caught the incident above.
 *   4. every batch's payload endpoint, and one media item per batch that has media.
 *
 * Run it:
 *
 *     NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *       research/v3/src/review-server/verify-live.ts --base http://127.0.0.1:3010
 *
 * Exit **0** when every check passed, **1** when any failed. Each failure prints a NAMED check, the
 * URL, and what happened, so a failure can be acted on without re-deriving anything.
 */
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { DEFAULT_PORT } from "./server.ts"

/**
 * The failure names. A named check is greppable and quotable; "verification failed" is not.
 * [REVIEWED] — one name per way the handoff has actually been observed to break, plus the two
 * transport failures that make everything else meaningless.
 */
export const LIVE_CHECKS = [
	"UNREACHABLE",
	"ROOT_NOT_OK",
	"ROOT_NOT_HTML",
	"DASHBOARD_API_NOT_OK",
	"DASHBOARD_API_MALFORMED",
	"PAGE_NOT_OK",
	"ASSET_NOT_OK",
	"MODULE_NOT_OK",
	"BATCH_PAYLOAD_NOT_OK",
	"MEDIA_NOT_OK",
	"MEDIA_NOT_IMAGE",
] as const
export type LiveCheck = (typeof LIVE_CHECKS)[number]

export type LiveFailure = Readonly<{ check: LiveCheck; url: string; detail: string }>

export type LiveReport = Readonly<{
	base: string
	/** Every URL fetched, in the order it was reached. */
	visited: readonly string[]
	pages: readonly string[]
	modules: readonly string[]
	batches: readonly Readonly<{ batchId: string; payload: string; media: string | null }>[]
	failures: readonly LiveFailure[]
	ok: boolean
}>

/** Every review mode's page, checked whether or not a batch of that kind is currently queued. */
const MODE_PAGES = ["/", "/pairwise", "/calibration", "/amend", "/bracketing", "/oracle", "/oracle-review"] as const

/** Asset extensions worth following out of a page. Anything else is not this crawler's business. */
const ASSET_EXTENSIONS = [".js", ".css", ".svg", ".png", ".ico", ".woff2"] as const

/** `src="…"` / `href="…"` in served markup. The pages are hand-written HTML; no parser is needed. */
const HTML_REFERENCE = /(?:src|href)\s*=\s*"([^"]+)"/gu

/**
 * Module specifiers in served JavaScript: `from "x"`, `import "x"`, `import("x")`.
 *
 * Only relative or root-absolute specifiers ending in an extension we serve are followed, which
 * keeps prose inside a doc comment from being mistaken for an import. Bare specifiers are not a
 * thing here — the UI has no bundler and no import map.
 */
const MODULE_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']((?:\.{1,2}\/|\/)[^"']+)["']/gu

type Fetched = Readonly<{ status: number; contentType: string; text: string; error: string | null }>

async function get(url: string, wantsText: boolean): Promise<Fetched> {
	try {
		const response = await fetch(url)
		const contentType = response.headers.get("content-type") ?? ""
		// Media is fetched for its status and type, not its bytes — but the body must still be drained
		// or the socket stays open and the crawl ends up waiting on itself.
		if (!wantsText) await response.arrayBuffer()
		const text = wantsText ? await response.text() : ""
		return { status: response.status, contentType, text, error: null }
	} catch (error) {
		return { status: 0, contentType: "", text: "", error: (error as Error).message }
	}
}

function hasAssetExtension(pathname: string): boolean {
	return ASSET_EXTENSIONS.some((extension) => pathname.endsWith(extension))
}

/** Every `/media/...` URL anywhere in a payload, however deeply the mode happens to nest it. */
function mediaUrlsIn(value: unknown, found: string[] = []): string[] {
	if (typeof value === "string") {
		if (value.startsWith("/media/")) found.push(value)
	} else if (Array.isArray(value)) {
		for (const entry of value) mediaUrlsIn(entry, found)
	} else if (typeof value === "object" && value !== null) {
		for (const entry of Object.values(value)) mediaUrlsIn(entry, found)
	}
	return found
}

export async function verifyLive(base: string): Promise<LiveReport> {
	const origin = base.replace(/\/+$/u, "")
	const failures: LiveFailure[] = []
	const visited: string[] = []
	const pages: string[] = []
	const modules: string[] = []
	const batches: { batchId: string; payload: string; media: string | null }[] = []
	const seen = new Set<string>()

	const fetchOnce = async (url: string, wantsText = true): Promise<Fetched | null> => {
		if (seen.has(url)) return null
		seen.add(url)
		visited.push(url)
		return get(url, wantsText)
	}

	/* 1 — the root the reviewer is told to open. */
	const root = (await fetchOnce(`${origin}/`))!
	if (root.error !== null) {
		// Nothing else can be true if the process is not listening, so this is the whole report.
		failures.push({ check: "UNREACHABLE", url: `${origin}/`, detail: root.error })
		return { base: origin, visited, pages, modules, batches, failures, ok: false }
	}
	if (root.status !== 200) {
		failures.push({ check: "ROOT_NOT_OK", url: `${origin}/`, detail: `status ${root.status}` })
	} else if (!root.contentType.startsWith("text/html")) {
		failures.push({ check: "ROOT_NOT_HTML", url: `${origin}/`, detail: `content-type ${root.contentType || "(none)"}` })
	}

	/* 2 — the dashboard payload, which is also where the batch links come from. */
	const dashboardUrl = `${origin}/api/dashboard`
	const dashboard = (await fetchOnce(dashboardUrl))!
	let open: Record<string, any>[] = []
	let released: Record<string, any>[] = []
	if (dashboard.status !== 200) {
		failures.push({ check: "DASHBOARD_API_NOT_OK", url: dashboardUrl, detail: `status ${dashboard.status}` })
	} else {
		try {
			const parsed = JSON.parse(dashboard.text) as { open?: unknown; released?: unknown }
			if (!Array.isArray(parsed.open) || !Array.isArray(parsed.released)) throw new Error("missing open/released")
			open = parsed.open as Record<string, any>[]
			released = parsed.released as Record<string, any>[]
		} catch (error) {
			failures.push({ check: "DASHBOARD_API_MALFORMED", url: dashboardUrl, detail: (error as Error).message })
		}
	}

	/* 3 — every page, every asset it references, and every module those assets import. */
	const pageQueue = [
		...MODE_PAGES,
		...[...open, ...released].flatMap((entry) =>
			[entry.page, entry.afterRelease].filter((value): value is string => typeof value === "string"),
		),
	]
	const queuedPages = new Set<string>()
	const assetQueue: string[] = []

	const noteReference = (raw: string, from: string): void => {
		let resolved: URL
		try {
			resolved = new URL(raw, from)
		} catch {
			return
		}
		if (resolved.origin !== new URL(origin).origin) return
		if (resolved.pathname.startsWith("/api/") || resolved.pathname.startsWith("/media/")) return
		if (hasAssetExtension(resolved.pathname)) assetQueue.push(resolved.href)
		else if (!queuedPages.has(resolved.pathname)) {
			queuedPages.add(resolved.pathname)
			pageQueue.push(resolved.pathname + resolved.search)
		}
	}

	for (const path of pageQueue) {
		const url = new URL(path, origin).href
		queuedPages.add(new URL(url).pathname)
		const page = await fetchOnce(url)
		if (page === null) continue
		pages.push(url)
		if (page.status !== 200) {
			failures.push({ check: "PAGE_NOT_OK", url, detail: `status ${page.status}` })
			continue
		}
		for (const match of page.text.matchAll(HTML_REFERENCE)) noteReference(match[1], url)
	}

	// Assets, then their imports, then THEIR imports: the module graph is crawled to a fixed point,
	// because the failure being guarded against was exactly one level deeper than anybody looked.
	while (assetQueue.length > 0) {
		const url = assetQueue.shift()!
		const asset = await fetchOnce(url)
		if (asset === null) continue
		const isModule = new URL(url).pathname.endsWith(".js")
		if (asset.status !== 200) {
			failures.push({
				check: isModule ? "MODULE_NOT_OK" : "ASSET_NOT_OK",
				url,
				detail: `status ${asset.status} — a 404 here leaves the page stuck on its loading placeholder`,
			})
			continue
		}
		if (!isModule) continue
		modules.push(url)
		for (const match of asset.text.matchAll(MODULE_SPECIFIER)) {
			const specifier = match[1]
			if (!hasAssetExtension(new URL(specifier, url).pathname)) continue
			noteReference(specifier, url)
		}
	}

	/* 4 — every batch's payload, and one media item per batch that has any. */
	for (const entry of [...open, ...released]) {
		const payloadUrl = new URL(String(entry.payload), origin).href
		const payload = await fetchOnce(payloadUrl)
		let media: string | null = null
		if (payload !== null) {
			if (payload.status !== 200) {
				failures.push({ check: "BATCH_PAYLOAD_NOT_OK", url: payloadUrl, detail: `status ${payload.status}` })
			} else {
				let parsed: unknown = null
				try {
					parsed = JSON.parse(payload.text)
				} catch (error) {
					failures.push({ check: "BATCH_PAYLOAD_NOT_OK", url: payloadUrl, detail: (error as Error).message })
				}
				// One item is enough. Media resolution is per batch — it either survived the push and any
				// restart since, or it did not — and fetching every artwork would make this too slow to be
				// the thing that always runs.
				const first = mediaUrlsIn(parsed)[0]
				if (first !== undefined) {
					media = new URL(first, origin).href
					const bytes = await fetchOnce(media, false)
					if (bytes !== null) {
						if (bytes.status !== 200) {
							failures.push({ check: "MEDIA_NOT_OK", url: media, detail: `status ${bytes.status}` })
						} else if (!bytes.contentType.startsWith("image/")) {
							failures.push({ check: "MEDIA_NOT_IMAGE", url: media, detail: `content-type ${bytes.contentType}` })
						}
					}
				}
			}
		}
		batches.push({ batchId: String(entry.batchId), payload: payloadUrl, media })
	}

	return { base: origin, visited, pages, modules, batches, failures, ok: failures.length === 0 }
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			base: { type: "string", default: `http://127.0.0.1:${DEFAULT_PORT}` },
			quiet: { type: "boolean", default: false },
		},
		strict: true,
	})
	const report = await verifyLive(values.base!)
	const say = (line: string) => {
		if (values.quiet !== true) process.stdout.write(`${line}\n`)
	}
	say(`verify-live ${report.base}`)
	say(`  pages     ${report.pages.length}`)
	say(`  modules   ${report.modules.length}`)
	say(`  batches   ${report.batches.length} (${report.batches.filter((entry) => entry.media !== null).length} with media)`)
	say(`  requests  ${report.visited.length}`)
	for (const failure of report.failures) {
		process.stderr.write(`FAILED ${failure.check} ${failure.url} — ${failure.detail}\n`)
	}
	if (!report.ok) {
		process.stderr.write(
			`verify-live: ${report.failures.length} failure(s) — do NOT hand this URL to the reviewer\n`,
		)
		process.exit(1)
	}
	say("verify-live: OK — every page, asset, module, payload and sample image served")
	process.exit(0)
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
	await main()
}
