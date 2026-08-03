/*
 * Oracle validation — the reviewer-facing half of REVIEW_UI.md §6.
 *
 * One artwork, one question, one closed vocabulary, and nothing else on screen. The pass runs one
 * question across every artwork before moving to the next question, so the reviewer holds one
 * criterion in their head for the whole run instead of re-reading a form per item. Keyboard only:
 * the answer keys are whatever the fixture bound (1–9 for an enum, y/n for a boolean), `u` steps
 * back, `r` releases. It auto-advances, resumes wherever you stopped, and is meant for ten-minute
 * chunks.
 *
 * The page knows nothing about what the oracle answered or what the algorithm published — the
 * server does not serve either, and this batch exists precisely to break a tie between them.
 *
 * The answer mapping is on screen for every item. That is not decoration: an answer key the
 * reviewer has to recall is an answer key they will eventually mis-press, and there is no way to
 * find that afterwards in a closed vocabulary.
 */

const nodes = {
	preamble: document.querySelector("#preamble"),
	framing: document.querySelector("#framing"),
	question: document.querySelector("#question"),
	instruction: document.querySelector("#instruction"),
	progress: document.querySelector("#progress"),
	stage: document.querySelector("#stage"),
	mapping: document.querySelector("#mapping"),
	status: document.querySelector("#status"),
	undokey: document.querySelector("#undokey"),
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

/** True when the current question spends `u` on an answer, so `u` cannot also mean undo. */
function undoIsTaken() {
	const item = index < batch.items.length ? batch.items[index] : null
	const question = item === null ? null : questionOf(item)
	return question !== null && question.answers.some((entry) => entry.hotkey === "u")
}

function questionOf(item) {
	return batch.questions.find((entry) => entry.key === item.questionKey) ?? null
}

/** The first item with no answer yet — how "resumable anywhere" is implemented. */
function firstUnanswered() {
	const at = batch.items.findIndex((item) => item.answer === null)
	return at < 0 ? batch.items.length : at
}

function renderMapping(question) {
	nodes.mapping.replaceChildren(
		...question.answers.map((answer) =>
			el(
				"li",
				{ class: "oracle-map" },
				el("b", { text: answer.hotkey }),
				el("span", { class: "oracle-map-label", text: answer.label }),
				el("span", { class: "oracle-map-gloss", text: answer.gloss }),
			),
		),
	)
}

function render() {
	if (index >= batch.items.length) {
		nodes.question.textContent = "every item answered"
		nodes.instruction.textContent = ""
		nodes.preamble.textContent = ""
		nodes.framing.textContent = ""
		nodes.progress.textContent = `${batch.items.length} / ${batch.items.length}`
		nodes.mapping.replaceChildren()
		nodes.stage.replaceChildren(
			el(
				"div",
				{ class: "oracle-done" },
				el("p", { text: batch.released ? "this round is released — thank you" : "press r to release the round" }),
			),
		)
		return
	}
	const item = batch.items[index]
	const question = questionOf(item)
	nodes.question.textContent = question === null ? item.questionKey : question.question
	nodes.instruction.textContent = question === null ? "" : question.instruction
	// The referent preamble and the unsure framing sit above the question on EVERY item of every
	// pass, not once at the start: they are what makes these probes answerable on a background made
	// of several parts, and a reviewer who scrolled past them once is answering a different question.
	nodes.preamble.textContent = question?.preamble ?? ""
	nodes.framing.textContent = question?.framing ?? ""
	if (question !== null) renderMapping(question)
	nodes.undokey.textContent = undoIsTaken() ? "backspace" : "u"

	// Progress is reported inside the pass, not across the batch: the reviewer is answering one
	// question, and "12 of 30" for that question is the number that says how much is left of it.
	const pass = batch.items.filter((entry) => entry.questionKey === item.questionKey)
	const positionInPass = pass.indexOf(item) + 1
	const answeredInPass = pass.filter((entry) => entry.answer !== null).length
	const answeredLabel = item.answer === null ? "" : ` · answered ${item.answer}`
	const passLabel = batch.questions.length > 1 ? `${item.questionKey} · ` : ""
	nodes.progress.textContent = `${passLabel}${positionInPass} / ${pass.length}${answeredLabel} · ${answeredInPass} done`

	// The artwork is the whole judgement, so it gets the whole stage. Intrinsic dimensions come from
	// the file header, so the frame does not jump when the bytes arrive.
	const image = el("img", { class: "oracle-art" })
	image.src = item.media
	image.alt = "album artwork"
	image.width = item.width
	image.height = item.height
	nodes.stage.replaceChildren(image)
}

async function answer(value) {
	if (busy || index >= batch.items.length) return
	const item = batch.items[index]
	busy = true
	try {
		// The token is all the page ever knows an item by; the server resolves it to the real item.
		await api(
			`/api/oracle-validation/${encodeURIComponent(batch.batchId)}/items/${encodeURIComponent(item.token)}/answer`,
			{
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ answer: value }),
			},
		)
		item.answer = value
		status(`recorded ${value}`)
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
	const item = index < batch.items.length ? batch.items[index] : null
	const question = item === null ? null : questionOf(item)
	const chosen = question === null ? undefined : question.answers.find((entry) => entry.hotkey === key)
	if (chosen !== undefined) answer(chosen.key)
	// `u` is undo unless the question spends it on an answer — the probe round binds y/n/u, so there
	// undo is Backspace or ArrowLeft, and the footer says which.
	else if ((key === "u" && !undoIsTaken()) || event.key === "Backspace") undo()
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
			.filter((entry) => entry.kind === "oracle-validation")
			.sort((a, b) => (a.pushedAt < b.pushedAt ? -1 : 1))
		const chosen =
			rounds.find((entry) => entry.batchId === wanted) ??
			rounds.filter((entry) => !entry.released).at(-1) ??
			rounds.at(-1)
		if (chosen === undefined) {
			nodes.question.textContent = "no oracle-validation round in the queue"
			status("push one to /api/oracle-validation")
			return
		}
		batch = await api(`/api/oracle-validation/${encodeURIComponent(chosen.batchId)}`)
		index = firstUnanswered()
		render()
		status(`${batch.batchId} — resuming at item ${Math.min(index + 1, batch.items.length)}`)
	} catch (error) {
		status(`could not load: ${error.message}`)
	}
}

await start()
