/*
 * Oracle adjudication — the post-release browse of a finished validation round.
 *
 * The answering pass withholds everything about the two sides it is adjudicating, on purpose. This
 * page is the opposite: the round is released, the answers are frozen, and the reviewer is now
 * looking at their own answer next to both oracle variants and the published flag, to judge a
 * different question — "was the oracle's reading defensible, or did it misread the artwork?"
 *
 * Read-only about the round: nothing here can change an answer. The one thing it writes is an
 * optional per-item annotation, appended as a `note` record the moment a key is pressed. No release,
 * no ceremony, no completeness requirement — the reviewer can annotate three items and close the tab.
 *
 * The server serves this only for a released batch. That is not politeness, it is the guard: the
 * same payload against an open batch would unblind live judging.
 */

const nodes = {
	question: document.querySelector("#question"),
	totals: document.querySelector("#totals"),
	sections: document.querySelector("#sections"),
	status: document.querySelector("#status"),
}

let payload = null
/** Every item across every section, in reading order — what j/k walks. */
let items = []
let index = 0
let busy = false

function el(tag, options = {}, ...children) {
	const node = document.createElement(tag)
	if (options.class) node.className = options.class
	if (options.text !== undefined) node.textContent = String(options.text)
	node.append(...children.filter((child) => child !== null && child !== undefined))
	return node
}

function status(message) {
	nodes.status.textContent = message
}

async function api(path, init) {
	const response = await fetch(path, init)
	const body = await response.json().catch(() => ({}))
	if (!response.ok) throw new Error(body.error ?? `${response.status} ${response.statusText}`)
	return body
}

/** One labelled fact. Plain text in two columns — there are only two colours on this page. */
function fact(label, value, marks = "") {
	return el("div", { class: "adj-fact" }, el("span", { class: "adj-fact-label", text: label }), el("span", { text: `${value}${marks}` }))
}

function renderItem(item, position) {
	const image = el("img", { class: "adj-art" })
	image.src = item.media
	image.alt = item.fileName
	image.width = item.width
	image.height = item.height

	const facts = el(
		"div",
		{ class: "adj-facts" },
		fact("you answered", item.reviewer),
		...item.oracle.map((entry) =>
			// The starred variant is the one whose reading the published flag contradicts — the reason
			// this artwork is in the round at all.
			fact(`oracle ${entry.variant}`, entry.groundType, entry.contradicted ? "  ← contradicted the flag" : ""),
		),
		fact("published flag", item.flag),
		fact("you sided with", item.sidedWith),
		fact("annotation", item.annotation ?? "—"),
	)

	const node = el(
		"article",
		{ class: `adj-item${position === index ? " adj-current" : ""}` },
		el("h3", { class: "adj-item-head", text: `${position + 1}. ${item.fileName}  ·  ${item.stratum}` }),
		image,
		facts,
	)
	return node
}

function render() {
	nodes.question.textContent = payload.question.question
	nodes.totals.textContent =
		`${payload.totals.items} items · released ${payload.releasedAt} · ` +
		`${payload.totals.annotated} annotated (${payload.totals["oracle-defensible"]} defensible, ` +
		`${payload.totals["oracle-misread"]} misread)`

	let position = 0
	nodes.sections.replaceChildren(
		...payload.sections.map((section) =>
			el(
				"section",
				{ class: "adj-section" },
				el("h2", { text: `${section.title} — ${section.items.length}` }),
				el("p", { class: "adj-blurb", text: section.blurb }),
				...section.items.map((item) => renderItem(item, position++)),
			),
		),
	)
}

async function annotate(verdict) {
	if (busy || items.length === 0) return
	const item = items[index]
	busy = true
	try {
		await api(`/api/oracle-review/${encodeURIComponent(payload.batchId)}/items/${encodeURIComponent(item.token)}/note`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ verdict }),
		})
		// Re-annotating an item appends a second note; the later one is the reviewer's position.
		const wasAnnotated = item.annotation !== null
		if (item.annotation !== verdict) {
			payload.totals[verdict] += 1
			if (wasAnnotated) payload.totals[item.annotation] -= 1
			else payload.totals.annotated += 1
		}
		item.annotation = verdict
		status(`recorded "${verdict}" for ${item.fileName}`)
		if (index < items.length - 1) index += 1
		render()
	} catch (error) {
		status(`not recorded: ${error.message}`)
	} finally {
		busy = false
	}
}

function move(step) {
	const next = index + step
	if (next < 0 || next >= items.length) {
		status(next < 0 ? "already at the first item" : "already at the last item")
		return
	}
	index = next
	status(`${index + 1} of ${items.length}`)
	render()
}

function onKey(event) {
	if (event.metaKey || event.ctrlKey || event.altKey) return
	const key = event.key.toLowerCase()
	if (key === "d") annotate("oracle-defensible")
	else if (key === "m") annotate("oracle-misread")
	else if (key === "s" || key === "j" || event.key === "ArrowDown") move(1)
	else if (key === "k" || event.key === "ArrowUp") move(-1)
	else return
	event.preventDefault()
}

async function start() {
	document.addEventListener("keydown", onKey)
	try {
		const queue = await api("/api/queue")
		const wanted = new URL(globalThis.location.href).searchParams.get("batch")
		// Released rounds only — an open one has no adjudication view, by design.
		const rounds = queue.batches
			.filter((entry) => entry.kind === "oracle-validation" && entry.released)
			.sort((a, b) => (a.releasedAt < b.releasedAt ? -1 : 1))
		const chosen = rounds.find((entry) => entry.batchId === wanted) ?? rounds.at(-1)
		if (chosen === undefined) {
			nodes.totals.textContent = "no released oracle-validation round to adjudicate"
			status("this view opens only after a round is released")
			return
		}
		payload = await api(`/api/oracle-review/${encodeURIComponent(chosen.batchId)}`)
		items = payload.sections.flatMap((section) => section.items)
		render()
		status(`${payload.batchId} — ${items.length} items, annotation optional`)
	} catch (error) {
		status(`could not load: ${error.message}`)
	}
}

await start()
