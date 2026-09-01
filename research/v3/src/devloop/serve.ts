/**
 * The dev viewer's server: a run's palettes beside the artworks they came from, and two runs side by
 * side, biggest change first.
 *
 * ## It is not the review server, and that is the whole design
 *
 * This serves **nothing but derived files a developer just produced**, over `127.0.0.1`, to pages the
 * kit puts in browse mode. It has no warehouse, no batch log, no reviewer id, and no route that
 * writes anything anywhere. A developer looking at their own candidate's output is not reviewing, and
 * data that arrives from a dev loop is not evidence — keeping the two servers apart is what makes
 * that structurally true rather than a matter of remembering.
 *
 * Two consequences worth stating, because both look like omissions:
 *
 * - **No blinding, and no payload allowlist.** `review-server/round-kit.ts` withholds the algorithm
 *   version, the content hash and the image path from a review page, because a reviewer who can see
 *   which arm produced a palette is not grading the palette. Here the developer *is* the author, the
 *   arm is the thing they are looking at, and the path is what they need to reproduce it. Serving a
 *   projected payload would hide exactly the fields that make a dev viewer useful, to protect a
 *   judgement nobody is making.
 * - **No answers, and no way to give one.** The pages run in the kit's browse mode, where the one
 *   function that posts an answer throws. Nothing here would accept one either.
 *
 * ## What it serves
 *
 * | route | what |
 * |---|---|
 * | `/` | the index: every run, every diffable pair |
 * | `/api/queue` | the kit's queue, from the run files on disk — same shape the review server serves |
 * | `/api/devloop-run/<runId>` | one run as a browse payload |
 * | `/api/devloop-diff/<before>..<after>` | two runs, diffed and ordered, as a browse payload |
 * | `/api/devloop-media/<runId>/<index>` | the artwork bytes for one row |
 * | everything else | static files from `review-ui/` |
 */

import { createServer, type Server } from "node:http"
import { readFile } from "node:fs/promises"
import { basename, extname, join, normalize, resolve } from "node:path"
import { V3_ROOT } from "./code-version.ts"
import { diffRuns, type DiffEntry } from "./diff.ts"
import { listRunFiles, readRunFile, RUNS_ROOT } from "./run.ts"
import { sideFromPalette } from "./side.ts"
import type { RunFile } from "./types.ts"

const UI_ROOT = join(V3_ROOT, "review-ui")

/**
 * The kit reads `kind` off the queue to find its own rounds. These two are this server's.
 *
 * [UNCALIBRATED] — names, chosen here. They are deliberately unlike any review-server batch kind, so
 * a dev page pointed at the reviewer's server would find no round rather than open somebody's batch.
 */
export const RUN_BATCH_KIND = "devloop-run"
export const DIFF_BATCH_KIND = "devloop-diff"

/**
 * Separator between the two run ids in a diff batch id.
 *
 * [UNCALIBRATED] — chosen here. Two dots rather than one, because a run id already contains single
 * dots and a hyphen, and splitting on either would cut a run id in half.
 */
export const DIFF_ID_SEPARATOR = ".."

const CONTENT_TYPES: Readonly<Record<string, string>> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".avif": "image/avif",
	".webp": "image/webp",
}

/**
 * A short name for one row, in the same `<batch>/<item>#<sha8>` shape the review pages use.
 *
 * The kit renders it click-to-select, and it is what a developer pastes when they want to say which
 * cover they mean. Same shape on both servers on purpose: one habit, not two.
 */
function itemRef(runId: string, index: number, contentHash: string): string {
	return `${runId}/row-${String(index).padStart(4, "0")}#${contentHash.slice(0, 8)}`
}

/** The browse payload for one run. */
export function runPayload(run: RunFile): Record<string, unknown> {
	return {
		batchId: run.header.runId,
		purpose: "devloop-run",
		released: false,
		questions: [
			{
				key: "devloop-run",
				kind: "browse",
				question: `${run.header.candidateId} — ${run.header.imageCount} covers from ${run.header.setName}`,
				instruction: "read-only. j / k or the arrows move between covers; nothing is recorded.",
				preamble: `code ${run.header.codeVersion.slice(0, 12)} · set ${run.header.setHash.slice(0, 12)} · run ${run.header.startedAt}`,
			},
		],
		items: run.rows.map((row) => ({
			token: String(row.index),
			questionKey: "devloop-run",
			media: `/api/devloop-media/${encodeURIComponent(run.header.runId)}/${row.index}`,
			width: row.palette?.metadata.sourceRendition.width ?? 0,
			height: row.palette?.metadata.sourceRendition.height ?? 0,
			itemRef: itemRef(run.header.runId, row.index, row.inputContentHash),
			imagePath: row.imagePath,
			ok: row.ok,
			error: row.error,
			cached: row.cached,
			computeMs: Math.round(row.computeMs),
			side: row.palette === null ? null : sideFromPalette(row.palette),
		})),
	}
}

/** How a diff entry's numbers are shown in the viewer's context strip. */
function diffSummaryLine(entry: DiffEntry): string {
	if (entry.maxRolePairDistance === null) return entry.status
	const perRole = entry.perRole
	const roles = perRole === null ? "" : Object.entries(perRole).map(([role, value]) => `${role} ${value.toFixed(4)}`).join(" · ")
	return (
		`max role-pair OKLab distance ${entry.maxRolePairDistance.toFixed(4)} on ${entry.worstRole}` +
		` · mean ${(entry.meanRolePairDistance ?? 0).toFixed(4)}` +
		(entry.gradientChanged ? " · gradient changed" : "") +
		(entry.collapseChanged ? " · collapse flags changed" : "") +
		(entry.inputChanged ? " · THE INPUT FILE ITSELF CHANGED" : "") +
		`\n${roles}`
	)
}

/** The browse payload for a diff between two runs. */
export function diffPayload(before: RunFile, after: RunFile): Record<string, unknown> {
	const diff = diffRuns(before, after)
	const batchId = `${before.header.runId}${DIFF_ID_SEPARATOR}${after.header.runId}`
	return {
		batchId,
		purpose: "devloop-diff",
		released: false,
		questions: [
			{
				key: "devloop-diff",
				kind: "browse",
				question: `${diff.changedCount} of ${diff.entries.length} covers changed — biggest first`,
				instruction: "read-only. before is on the left, after on the right; nothing is recorded.",
				preamble:
					`${before.header.runId} → ${after.header.runId}` +
					(diff.sameSet ? "" : " · WARNING: these runs are over different sets") +
					(diff.onlyInBefore.length + diff.onlyInAfter.length > 0
						? ` · ${diff.onlyInBefore.length} only in before, ${diff.onlyInAfter.length} only in after`
						: ""),
			},
		],
		items: diff.entries.map((entry, position) => ({
			token: String(position),
			questionKey: "devloop-diff",
			media: `/api/devloop-media/${encodeURIComponent(after.header.runId)}/${entry.index}`,
			width: entry.after?.metadata.sourceRendition.width ?? entry.before?.metadata.sourceRendition.width ?? 0,
			height: entry.after?.metadata.sourceRendition.height ?? entry.before?.metadata.sourceRendition.height ?? 0,
			itemRef: `${batchId}/rank-${String(position).padStart(4, "0")}`,
			imagePath: entry.imagePath,
			status: entry.status,
			maxRolePairDistance: entry.maxRolePairDistance,
			summary: diffSummaryLine(entry),
			before: entry.before === null ? null : sideFromPalette(entry.before),
			after: entry.after === null ? null : sideFromPalette(entry.after),
		})),
	}
}

/* ------------------------------------------------------------------------------------------- */
/* The server                                                                                     */
/* ------------------------------------------------------------------------------------------- */

export type DevLoopServerOptions = Readonly<{ runsRoot?: string }>

export type DevLoopServerHandle = Readonly<{
	server: Server
	listen(port: number): Promise<number>
	close(): Promise<void>
}>

export function createDevLoopServer(options: DevLoopServerOptions = {}): DevLoopServerHandle {
	const runsRoot = resolve(options.runsRoot ?? RUNS_ROOT)

	/** Every run on disk, newest first. Re-read per request: a dev server that caches its own inputs
	 * would need restarting after every run, which is the loop it exists to shorten. */
	async function loadRuns(): Promise<RunFile[]> {
		const paths = await listRunFiles(runsRoot)
		const runs: RunFile[] = []
		for (const path of paths) {
			try {
				runs.push(await readRunFile(path))
			} catch {
				// A half-written file from a run in flight. Skipped, not fatal.
			}
		}
		return runs
	}

	async function runById(id: string): Promise<RunFile | null> {
		return (await loadRuns()).find((run) => run.header.runId === id) ?? null
	}

	/** Pairs worth diffing: same candidate lineage over the same set, newer against older. */
	function diffPairs(runs: readonly RunFile[]): { before: RunFile; after: RunFile }[] {
		const pairs: { before: RunFile; after: RunFile }[] = []
		for (const [position, after] of runs.entries()) {
			const before = runs.slice(position + 1).find((candidate) => candidate.header.setHash === after.header.setHash)
			if (before !== undefined) pairs.push({ before, after })
		}
		return pairs
	}

	const server = createServer((request, response) => {
		void (async () => {
			const send = (status: number, body: string | Buffer, type: string): void => {
				response.writeHead(status, { "content-type": type, "cache-control": "no-store" })
				response.end(body)
			}
			const sendJson = (status: number, body: unknown): void =>
				send(status, JSON.stringify(body), CONTENT_TYPES[".json"])

			try {
				// Read-only, structurally. There is nothing here to write to, and a server that answered a
				// POST with a cheerful 200 would look writable to anyone probing it — including to a page
				// that had a bug. `GET` and `HEAD`, or 405.
				if (request.method !== "GET" && request.method !== "HEAD") {
					send(405, "the dev loop viewer is read-only", "text/plain; charset=utf-8")
					return
				}

				const url = new URL(request.url ?? "/", "http://127.0.0.1")
				const path = decodeURIComponent(url.pathname)

				if (path === "/api/queue") {
					const runs = await loadRuns()
					const batches = [
						...runs.map((run) => ({
							batchId: run.header.runId,
							kind: RUN_BATCH_KIND,
							purpose: "devloop-run",
							pushedAt: run.header.startedAt,
							released: false,
							itemCount: run.header.imageCount,
						})),
						...diffPairs(runs).map(({ before, after }) => ({
							batchId: `${before.header.runId}${DIFF_ID_SEPARATOR}${after.header.runId}`,
							kind: DIFF_BATCH_KIND,
							purpose: "devloop-diff",
							pushedAt: after.header.startedAt,
							released: false,
							itemCount: after.header.imageCount,
						})),
					]
					sendJson(200, { batches })
					return
				}

				if (path.startsWith("/api/devloop-run/")) {
					const run = await runById(path.slice("/api/devloop-run/".length))
					if (run === null) {
						sendJson(404, { error: "no such run" })
						return
					}
					sendJson(200, runPayload(run))
					return
				}

				if (path.startsWith("/api/devloop-diff/")) {
					const ids = path.slice("/api/devloop-diff/".length).split(DIFF_ID_SEPARATOR)
					if (ids.length !== 2) {
						sendJson(400, { error: `a diff id is <before>${DIFF_ID_SEPARATOR}<after>` })
						return
					}
					const before = await runById(ids[0])
					const after = await runById(ids[1])
					if (before === null || after === null) {
						sendJson(404, { error: "one of those runs is not on disk" })
						return
					}
					sendJson(200, diffPayload(before, after))
					return
				}

				if (path.startsWith("/api/devloop-media/")) {
					const [runId, indexText] = path.slice("/api/devloop-media/".length).split("/")
					const run = await runById(runId ?? "")
					const row = run?.rows.find((entry) => entry.index === Number(indexText))
					if (row === undefined) {
						send(404, "no such row", "text/plain; charset=utf-8")
						return
					}
					send(200, await readFile(row.imagePath), CONTENT_TYPES[extname(row.imagePath).toLowerCase()] ?? "application/octet-stream")
					return
				}

				if (path === "/" || path === "/index.html") {
					send(200, await indexPage(await loadRuns(), diffPairs), CONTENT_TYPES[".html"])
					return
				}

				// Static files from review-ui/. `normalize` plus the prefix check is what keeps a
				// `../../` out of the response — this server reads files for a living and runs on a
				// developer's machine, which is not a reason to be careless with paths.
				const target = normalize(join(UI_ROOT, path))
				if (!target.startsWith(UI_ROOT)) {
					send(403, "no", "text/plain; charset=utf-8")
					return
				}
				send(200, await readFile(target), CONTENT_TYPES[extname(target).toLowerCase()] ?? "application/octet-stream")
			} catch (error) {
				const message = (error as NodeJS.ErrnoException).code === "ENOENT" ? "not found" : (error as Error).message
				send((error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500, message, "text/plain; charset=utf-8")
			}
		})()
	})

	return {
		server,
		listen: (port) =>
			new Promise((ready) => {
				server.listen(port, "127.0.0.1", () => ready((server.address() as { port: number }).port))
			}),
		close: () => new Promise((done) => server.close(() => done())),
	}
}

/**
 * The index: every run, and every pair that can be diffed.
 *
 * Plain links, no script. It is a directory, not a round — the two round pages are where the kit is,
 * and this is the thing that points at them.
 */
async function indexPage(
	runs: readonly RunFile[],
	diffPairs: (runs: readonly RunFile[]) => { before: RunFile; after: RunFile }[],
): Promise<string> {
	const escape = (text: string): string => text.replace(/[&<>"]/gu, (character) => `&#${character.charCodeAt(0)};`)
	const runRows = runs
		.map((run) => {
			const footer = run.footer
			return (
				`<li><a href="/devloop-run.html?batch=${encodeURIComponent(run.header.runId)}">${escape(run.header.runId)}</a>` +
				`<br /><small>${run.header.imageCount} covers · code ${escape(run.header.codeVersion.slice(0, 12))}` +
				(footer === null ? " · unfinished" : ` · ${footer.okCount} ok, ${footer.failedCount} failed, ${footer.cacheHits} cached · ${footer.wallMs} ms`) +
				`<br />${escape(basename(run.path))}</small></li>`
			)
		})
		.join("\n")
	const diffRows = diffPairs(runs)
		.map(({ before, after }) => {
			const id = `${before.header.runId}${DIFF_ID_SEPARATOR}${after.header.runId}`
			return `<li><a href="/devloop-diff.html?batch=${encodeURIComponent(id)}">${escape(before.header.runId)} → ${escape(after.header.runId)}</a></li>`
		})
		.join("\n")

	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>dev loop</title><link rel="stylesheet" href="/styles.css" /></head>
<body class="oracle-body"><main class="oracle-stage devloop-index">
<h1>dev loop</h1>
<p class="devloop-warning">Read-only developer view. Nothing on these pages is recorded, and none of it is evidence.</p>
<h2>runs</h2><ul>${runRows === "" ? "<li>no runs yet</li>" : runRows}</ul>
<h2>diffs</h2><ul>${diffRows === "" ? "<li>two runs over the same set are needed for a diff</li>" : diffRows}</ul>
</main></body></html>`
}

if (process.argv[1]?.endsWith("serve.ts")) {
	const at = process.argv.indexOf("--runs")
	const runsRoot = at === -1 ? process.env.DEVLOOP_RUNS : process.argv[at + 1]
	const handle = createDevLoopServer({ runsRoot })
	const requested = Number(process.env.DEVLOOP_PORT ?? 8791)
	const port = await handle.listen(requested)
	process.stdout.write(`dev loop viewer on http://127.0.0.1:${port}/  (runs from ${runsRoot ?? RUNS_ROOT})\n`)
}
