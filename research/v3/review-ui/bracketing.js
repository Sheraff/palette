/*
 * The colour bracketing round — the reviewer-facing half of PHASE_0_DECISIONS.md §3.
 *
 * Ruthlessly streamlined, in the shape REVIEW_UI.md §6 asks for: one question at a time, keyboard
 * only, auto-advance on answer, undo on one key, resumable anywhere. Nothing on screen but the
 * colours being judged and two lines of white-on-black chrome.
 *
 * The page knows nothing about distances, quadrants, controls or repeats: the server serves two
 * hex values per item and the answers come back as records. That is deliberate — a reviewer who can
 * see which pair is the control is no longer measuring anything.
 */

/*
 * The wording is served with the batch, never hardcoded here: the reviewer's first pass was
 * abandoned because the criterion was ambiguous on screen, and the fix only holds if the words on
 * the page are the same words recorded alongside the answers.
 */
const nodes = {
	question: document.querySelector("#question"),
	instruction: document.querySelector("#instruction"),
	progress: document.querySelector("#progress"),
	stage: document.querySelector("#stage"),
	status: document.querySelector("#status"),
}

let batch = null
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

/** The first item with no answer yet — how "resumable anywhere" is implemented. */
function firstUnanswered() {
	const at = batch.items.findIndex((item) => item.answer === null)
	return at < 0 ? batch.items.length - 1 : at
}

function renderPair(item) {
	const pair = el("div", { class: "pair" })
	const first = el("div", { class: "pair-field" })
	first.style.background = item.first
	const second = el("div", { class: "pair-field" })
	second.style.background = item.second
	pair.append(first, el("div", { class: "pair-divider" }), second)
	return pair
}

function renderAccent(item) {
	const stage = el("div", { class: "accent-stage" })
	stage.style.background = item.first
	for (const shape of ["accent-circle", "accent-triangle", "accent-ring"]) {
		const node = el("div", { class: `accent-shape ${shape}` })
		if (shape === "accent-ring") node.style.borderColor = item.second
		else node.style.background = item.second
		stage.append(node)
	}
	return stage
}

function render() {
	if (index >= batch.items.length) {
		nodes.question.textContent = "every item answered"
		nodes.instruction.textContent = ""
		nodes.progress.textContent = `${batch.items.length} / ${batch.items.length}`
		nodes.stage.replaceChildren(
			el(
				"div",
				{ class: "bracket-done" },
				el("p", { text: batch.released ? "this round is released — thank you" : "press r to release the round" }),
			),
		)
		return
	}
	const item = batch.items[index]
	const prompt = batch.prompts?.[item.part] ?? { question: item.part, instruction: "" }
	nodes.question.textContent = prompt.question
	nodes.instruction.textContent = prompt.instruction
	const answered = batch.items.filter((entry) => entry.answer !== null).length
	nodes.progress.textContent =
		`${index + 1} / ${batch.items.length}` +
		(item.answer === null ? "" : ` · answered ${item.answer ? "yes" : "no"}`) +
		` · ${answered} done`
	nodes.stage.replaceChildren(item.part === "accent-visible" ? renderAccent(item) : renderPair(item))
}

async function answer(value) {
	if (busy || index >= batch.items.length) return
	const item = batch.items[index]
	busy = true
	try {
		// The token is all the page ever knows an item by; the server resolves it to the real item.
		await api(`/api/bracketing/${encodeURIComponent(batch.batchId)}/items/${encodeURIComponent(item.token)}/answer`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ answer: value }),
		})
		item.answer = value
		status(`recorded ${value ? "yes" : "no"}`)
		index += 1
		render()
	} catch (error) {
		status(`not recorded: ${error.message}`)
	} finally {
		busy = false
	}
}

/**
 * Undo is one key and it does not delete anything: it steps back so the item can be answered again.
 * The new answer supersedes the old one at query time — the log stays append-only.
 */
function undo() {
	if (index === 0) {
		status("already at the first item")
		return
	}
	index -= 1
	status("stepped back — answer again to replace")
	render()
}

async function release() {
	try {
		const result = await api(`/api/batches/${encodeURIComponent(batch.batchId)}/release`, { method: "POST" })
		batch.released = true
		status(`released at ${result.releasedAt}`)
		render()
	} catch (error) {
		status(`release refused: ${error.message}`)
	}
}

function onKey(event) {
	if (event.metaKey || event.ctrlKey || event.altKey) return
	const key = event.key.toLowerCase()
	if (key === "y") answer(true)
	else if (key === "n") answer(false)
	else if (key === "u" || event.key === "Backspace") undo()
	else if (key === "r") release()
	else if (event.key === "ArrowLeft") undo()
	else return
	event.preventDefault()
}

async function start() {
	document.addEventListener("keydown", onKey)
	try {
		const queue = await api("/api/queue")
		const wanted = new URL(globalThis.location.href).searchParams.get("batch")
		// The NEWEST unreleased round, not the first: an abandoned earlier pass must never be the one
		// the reviewer lands on.
		const rounds = queue.batches
			.filter((entry) => entry.kind === "bracketing")
			.sort((a, b) => (a.pushedAt < b.pushedAt ? -1 : 1))
		const chosen =
			queue.batches.find((entry) => entry.batchId === wanted) ??
			rounds.filter((entry) => !entry.released).at(-1) ??
			rounds.at(-1)
		if (chosen === undefined) {
			nodes.question.textContent = "no bracketing round in the queue"
			status("push one to /api/bracketing")
			return
		}
		batch = await api(`/api/bracketing/${encodeURIComponent(chosen.batchId)}`)
		index = firstUnanswered()
		render()
		status(`${batch.batchId} — resuming at item ${index + 1}`)
	} catch (error) {
		status(`could not load: ${error.message}`)
	}
}

await start()
