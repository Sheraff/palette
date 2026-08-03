/*
 * The landing dashboard — the reviewer's single entry point.
 *
 * It exists because of five things the reviewer said, in their words: *"i never know if something is
 * waiting on a review from me · i never know where a review is (which path like /oracle) · i never
 * know if the server has been started already or if i have to start it myself"* — and, twice, a
 * review URL that opened into a permanent loading state. This page answers all of them at once:
 * every batch waiting on them, with its purpose, its size, how far in they are, and a link straight
 * to the page that reviews it. Released rounds are collapsed underneath, because "what is done" is
 * history, not queue.
 *
 * **This page imports nothing on purpose.** The incident that motivated it was a module import
 * (`keys.js`) that 404'd, which kills an ES module graph silently and leaves the markup's
 * "loading…" on screen forever. The one page the reviewer is told to open should have no module
 * graph to lose. It is plain DOM against one endpoint, and if that endpoint is unreachable it says
 * so in words instead of sitting there.
 */

/**
 * How often the queue is re-read, in milliseconds.
 * [UNCALIBRATED] — chosen here. The reviewer leaves this tab open; a batch pushed while they are
 * looking at it should appear without a reload. Cost is one small JSON read.
 */
const REFRESH_INTERVAL_MS = 5000

const nodes = {
	summary: document.querySelector("#summary"),
	open: document.querySelector("#open"),
	released: document.querySelector("#released"),
	releasedSummary: document.querySelector("#released-summary"),
	status: document.querySelector("#status"),
}

function el(tag, options = {}, ...children) {
	const node = document.createElement(tag)
	if (options.class) node.className = options.class
	if (options.text !== undefined) node.textContent = String(options.text)
	if (options.href !== undefined) node.setAttribute("href", options.href)
	if (options.style !== undefined) node.setAttribute("style", options.style)
	node.append(...children.filter((child) => child !== null && child !== undefined))
	return node
}

function status(message) {
	nodes.status.textContent = message
}

/** A timestamp the reviewer can act on: how long it has been waiting, not an ISO string. */
function since(iso) {
	const when = Date.parse(iso)
	if (!Number.isFinite(when)) return ""
	const minutes = Math.max(0, Math.round((Date.now() - when) / 60000))
	if (minutes < 1) return "just now"
	if (minutes < 60) return `${minutes} min ago`
	const hours = Math.round(minutes / 60)
	if (hours < 48) return `${hours} h ago`
	return `${Math.round(hours / 24)} days ago`
}

/** The batch's own name is the heading: it is what the orchestrator will call it when asking. */
function card(entry) {
	const done = entry.judgedCount
	const total = entry.itemCount
	const percent = total === 0 ? 0 : Math.round((done / total) * 100)
	return el(
		"article",
		{ class: "dash-card" },
		el(
			"h2",
			{ class: "dash-card-title" },
			el("a", { class: "dash-link", href: entry.page, text: entry.batchId }),
		),
		el(
			"p",
			{ class: "dash-meta" },
			el("span", { class: "dash-kind", text: entry.kind }),
			el("span", { class: "dash-purpose", text: entry.purpose }),
			el("span", { class: "dash-age", text: `pushed ${since(entry.pushedAt)}` }),
		),
		el(
			"div",
			{ class: "dash-progress" },
			el("div", { class: "dash-bar" }, el("div", { class: "dash-bar-fill", style: `width:${percent}%` })),
			el("p", {
				class: "dash-count",
				text: `${done} / ${total} answered · ${entry.remaining} left`,
			}),
		),
		el("p", { class: "dash-go" }, el("a", { class: "dash-open", href: entry.page, text: `open ${entry.page} →` })),
	)
}

function releasedRow(entry) {
	const revisit = entry.afterRelease
	return el(
		"p",
		{ class: "dash-released-row" },
		el("b", { text: entry.batchId }),
		el("span", { class: "dash-kind", text: entry.kind }),
		el("span", { class: "dash-age", text: `released ${since(entry.releasedAt)}` }),
		el("span", { class: "dash-count", text: `${entry.itemCount} items` }),
		revisit === null ? null : el("a", { class: "dash-link", href: revisit, text: "revisit" }),
	)
}

function render(data) {
	const open = data.open
	const waiting = open.reduce((sum, entry) => sum + entry.remaining, 0)
	nodes.summary.textContent =
		open.length === 0
			? "nothing is waiting on you — every pushed round is released"
			: `${open.length} round${open.length === 1 ? "" : "s"} waiting on you · ${waiting} item${waiting === 1 ? "" : "s"} left to answer`
	nodes.open.replaceChildren(
		...(open.length === 0
			? [el("p", { class: "dash-empty", text: "The queue is empty. The orchestrator will push the next round here." })]
			: open.map(card)),
	)
	nodes.releasedSummary.textContent = `released rounds (${data.released.length})`
	nodes.released.replaceChildren(...data.released.map(releasedRow))
}

async function refresh() {
	try {
		const response = await fetch("/api/dashboard")
		if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
		render(await response.json())
		status(`server up · refreshed ${new Date().toLocaleTimeString()}`)
	} catch (error) {
		// Said in words, on screen. A dashboard that cannot reach its server must not look like a
		// dashboard with nothing in it.
		status(`cannot reach the review server: ${error.message} — tell the orchestrator, do not start it yourself`)
	}
}

await refresh()
const timer = setInterval(refresh, REFRESH_INTERVAL_MS)
// Node runs this module in the page tests; an un-unref'd interval would hold the test process open.
timer?.unref?.()
